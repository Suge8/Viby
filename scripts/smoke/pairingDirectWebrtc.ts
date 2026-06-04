import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type DirectSmokeResult, runBrowserPair } from '../test-support/pairingDirectWebrtcPeer'
import {
    buildPairingSmokeVerifyCodeRequest,
    DIRECT_WEBRTC_SMOKE_PUBLIC_KEY,
} from '../test-support/pairingSmokeContracts'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(dirname(scriptDir))
const bundleDir = join(repoRoot, 'pairing', 'deploy-bundle')
const publicBrokerUrl = process.env.PAIRING_BROKER_URL || process.env.VIBY_PAIRING_BROKER_URL || 'https://pair.viby.run'

type CommandResult = { status: number | null; stdout: string; stderr: string }

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): CommandResult {
    const result = spawnSync(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        encoding: 'utf8',
    })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function runChecked(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
    const result = run(command, args, options)
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stderr || result.stdout}`)
    return result.stdout
}

async function pickPort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = net.createServer()
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            server.close(() => {
                if (!address || typeof address === 'string') reject(new Error('failed to allocate port'))
                else resolve(address.port)
            })
        })
    })
}

function ensureBundle(): void {
    if (!existsSync(join(bundleDir, 'run-pairing.sh'))) {
        throw new Error("Missing pairing deploy bundle. Run 'bun run build:pairing' first.")
    }
}

function createEvidenceDir(): string {
    const artifactRoot = join(repoRoot, '.artifacts', 'smoke')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const prefix = process.argv.includes('--public') ? 'pairing-prod-local-direct-webrtc' : 'pairing-direct-webrtc'
    const workDir = join(artifactRoot, `${prefix}-${stamp}`)
    mkdirSync(workDir, { recursive: true })
    return workDir
}

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function waitForBroker(port: number): void {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 20_000) {
        if (run('curl', ['-fsS', `http://127.0.0.1:${port}/ready`]).status === 0) return
        sleepSync(500)
    }
    throw new Error('pairing broker did not become ready')
}

function waitForPublicBroker(brokerUrl: string): void {
    const startedAt = Date.now()
    const readyUrl = new URL('/ready', brokerUrl).toString()
    while (Date.now() - startedAt < 20_000) {
        if (run('curl', ['-fsS', readyUrl]).status === 0) return
        sleepSync(500)
    }
    throw new Error(`public pairing broker did not become ready: ${readyUrl}`)
}

function startBroker(workDir: string, port: number, createToken: string): ChildProcess {
    const installDir = join(workDir, 'pairing')
    mkdirSync(installDir, { recursive: true })
    runChecked('cp', ['-R', `${bundleDir}/.`, installDir])
    writeFileSync(
        join(installDir, 'pairing.env'),
        [
            'PAIRING_HOST=127.0.0.1',
            `PAIRING_PORT=${port}`,
            `PAIRING_PUBLIC_URL=http://127.0.0.1:${port}`,
            `PAIRING_CREATE_TOKEN=${createToken}`,
            'PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS=60',
            '',
        ].join('\n')
    )
    const log = Bun.file(join(workDir, 'pairing.log')).writer()
    const child = spawn(join(installDir, 'run-pairing.sh'), { cwd: installDir, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (chunk) => log.write(chunk))
    child.stderr?.on('data', (chunk) => log.write(chunk))
    waitForBroker(port)
    return child
}

function stopProcess(child: ChildProcess | null): void {
    if (child && !child.killed) child.kill('SIGTERM')
}

async function requestJson<T>(baseUrl: string, path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, baseUrl), options)
    const text = await response.text()
    const body = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string })
    if (!response.ok) throw new Error(body.error || `${path} failed with ${response.status}`)
    return body
}

function assertDirect(result: DirectSmokeResult): void {
    if (result.localCandidateType === 'relay' || result.remoteCandidateType === 'relay') {
        throw new Error(`${result.role} selected relay candidate instead of direct: ${JSON.stringify(result)}`)
    }
    if (!result.localCandidateType || !result.remoteCandidateType) {
        throw new Error(`${result.role} selected candidate was not observable: ${JSON.stringify(result)}`)
    }
}

async function main(): Promise<void> {
    const publicMode = process.argv.includes('--public')
    if (!publicMode) ensureBundle()
    const port = publicMode ? 0 : await pickPort()
    const createToken = publicMode ? (process.env.PAIRING_CREATE_TOKEN ?? '') : `direct-${Date.now()}`
    if (publicMode && !createToken) throw new Error('PAIRING_CREATE_TOKEN is required for public WebRTC smoke')
    const brokerUrl = publicMode ? publicBrokerUrl : `http://127.0.0.1:${port}`
    const workDir = createEvidenceDir()
    let broker: ChildProcess | null = null
    try {
        if (publicMode) waitForPublicBroker(brokerUrl)
        else broker = startBroker(workDir, port, createToken)
        const created = await requestJson<{
            hostToken: string
            iceServers: RTCIceServer[]
            pairing: { id: string; shortCode: string | null }
            pairingUrl: string
            wsUrl: string
        }>(brokerUrl, '/pairings', {
            method: 'POST',
            headers: { authorization: `Bearer ${createToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Direct WebRTC Host' }),
        })
        if (!created.pairing.shortCode) throw new Error('create response missing shortCode')
        const verified = await requestJson<{ guestToken: string; wsUrl: string }>(
            brokerUrl,
            `/pairings/${created.pairing.id}/verify-code`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(
                    buildPairingSmokeVerifyCodeRequest({
                        code: created.pairing.shortCode,
                        label: 'Direct WebRTC Guest',
                        publicKey: DIRECT_WEBRTC_SMOKE_PUBLIC_KEY,
                    })
                ),
            }
        )
        const pingCount = 12
        const [host, guest] = await runBrowserPair({
            brokerUrl,
            createToken,
            hostWsUrl: created.wsUrl,
            guestWsUrl: verified.wsUrl,
            iceServers: created.iceServers,
            pingCount,
        })
        assertDirect(host)
        assertDirect(guest)
        const summary = {
            ok: true,
            transportMode: 'direct-webrtc',
            iceTransportPolicy: 'all',
            pingCount,
            ackCount: guest.ackCount,
            p50RttMs: guest.p50RttMs,
            p95RttMs: guest.p95RttMs,
            maxRttMs: guest.maxRttMs,
            hostCandidate: { local: host.localCandidateType, remote: host.remoteCandidateType },
            guestCandidate: { local: guest.localCandidateType, remote: guest.remoteCandidateType },
            brokerUrl,
            evidenceDir: workDir,
        }
        writeFileSync(join(workDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
        console.log(JSON.stringify(summary))
    } finally {
        stopProcess(broker)
        if (process.env.VIBY_PAIRING_DIRECT_WEBRTC_CLEAN_ARTIFACTS === '1')
            rmSync(workDir, { recursive: true, force: true })
        else {
            const logPath = join(workDir, 'pairing.log')
            if (existsSync(logPath))
                writeFileSync(logPath, readFileSync(logPath, 'utf8').replace(/(token=)[A-Za-z0-9_-]+/g, '$1<redacted>'))
            console.log(`[smoke] pairing direct WebRTC artifacts kept at ${workDir}`)
        }
    }
}

if (import.meta.main) await main()
