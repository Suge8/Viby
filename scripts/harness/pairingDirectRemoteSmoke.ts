import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveChromeExecutablePath } from './browserSmokeRuntime'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(dirname(scriptDir))
const endpointScript = join(scriptDir, 'pairingDirectEndpoint.mjs')
const aiortcEndpointScript = join(scriptDir, 'pairingDirectAiortcEndpoint.py')
const brokerUrl = process.env.PAIRING_BROKER_URL || process.env.VIBY_PAIRING_BROKER_URL || 'https://pair.viby.run'
const createToken = process.env.PAIRING_CREATE_TOKEN ?? ''
const remoteAlias = process.env.VIBY_PAIRING_REMOTE_SSH || 'HK-4c8g'
const remotePythonImage = process.env.VIBY_PAIRING_REMOTE_PYTHON_IMAGE || '1panel/maxkb:v2.8.1'
const pingCount = Number.parseInt(process.env.PING_COUNT || '12', 10)

type CommandResult = { status: number | null; stdout: string; stderr: string }
type EndpointResult = {
    ackCount: number
    localCandidateType: string | null
    p95RttMs?: number | null
    remoteCandidateType: string | null
    role: 'host' | 'guest'
}

function run(command: string, args: string[]): CommandResult {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function runChecked(command: string, args: string[]): string {
    const result = run(command, args)
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stderr || result.stdout}`)
    return result.stdout.trim()
}

function quote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`
}

function createEvidenceDir(): string {
    const artifactRoot = join(repoRoot, '.artifacts', 'harness')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const workDir = join(artifactRoot, `pairing-remote-direct-webrtc-${stamp}`)
    mkdirSync(workDir, { recursive: true })
    return workDir
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, brokerUrl), options)
    const text = await response.text()
    const body = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string })
    if (!response.ok) throw new Error(body.error || `${path} failed with ${response.status}`)
    return body
}

function redact(text: string): string {
    return text
        .replace(/(token=)[A-Za-z0-9_-]+/g, '$1<redacted>')
        .replace(/(WS_URL=)'[^']+'/g, "$1'<redacted>'")
        .replace(/("ticket"\s*:\s*")[^"]+"/g, '$1<redacted>"')
        .replace(/("wsUrl"\s*:\s*")[^"]+"/g, '$1<redacted>"')
}

function spawnLogged(command: string, args: string[], logPath: string, env: NodeJS.ProcessEnv = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        const log = Bun.file(logPath).writer()
        const append = (chunk: Buffer) => {
            const text = chunk.toString()
            output += text
            log.write(redact(text))
        }
        child.stdout?.on('data', append)
        child.stderr?.on('data', append)
        child.on('error', (error) => {
            void log.end()
            reject(error)
        })
        child.on('close', (code) => {
            void log.end()
            if (code === 0) resolve(output)
            else reject(new Error(`${command} ${args[0] ?? ''} exited ${code}; see ${logPath}`))
        })
    })
}

function parseResult(output: string): EndpointResult {
    const line = output
        .trim()
        .split('\n')
        .reverse()
        .find((candidate) => candidate.trim().startsWith('{') && candidate.trim().endsWith('}'))
    if (!line) throw new Error('endpoint result JSON missing')
    return JSON.parse(line) as EndpointResult
}

function assertDirect(result: EndpointResult, requireCandidate = true): void {
    if (result.localCandidateType === 'relay' || result.remoteCandidateType === 'relay') {
        throw new Error(`${result.role} selected relay candidate: ${JSON.stringify(result)}`)
    }
    if (requireCandidate && (!result.localCandidateType || !result.remoteCandidateType)) {
        throw new Error(`${result.role} selected candidate missing: ${JSON.stringify(result)}`)
    }
}

function assertDirectLatency(result: EndpointResult): void {
    const maxP95 = Number.parseInt(process.env.MAX_DIRECT_P95_RTT_MS || '750', 10)
    if (typeof result.p95RttMs === 'number' && result.p95RttMs > maxP95) {
        throw new Error(`remote direct p95 ${result.p95RttMs}ms exceeded ${maxP95}ms`)
    }
}

async function main(): Promise<void> {
    if (!createToken) throw new Error('PAIRING_CREATE_TOKEN is required for remote direct smoke')
    const workDir = createEvidenceDir()
    const remoteDir = runChecked('ssh', [remoteAlias, 'mktemp -d /tmp/viby-pairing-direct.XXXXXX'])
    try {
        runChecked('scp', [aiortcEndpointScript, `${remoteAlias}:${remoteDir}/endpoint.py`])
        await spawnLogged(
            'ssh',
            [
                remoteAlias,
                [
                    'docker run --rm --network=host',
                    `-v ${quote(remoteDir)}:/work`,
                    '--entrypoint sh',
                    quote(remotePythonImage),
                    '-lc',
                    quote("python3 -m pip install -q --target /work/vendor 'aiortc>=1.13,<2' 'websockets>=13,<16'"),
                ].join(' '),
            ],
            join(workDir, 'remote-aiortc-install.log')
        )
        const created = await requestJson<{
            hostToken: string
            iceServers: RTCIceServer[]
            pairing: { id: string }
            pairingUrl: string
            wsUrl: string
        }>('/pairings', {
            method: 'POST',
            headers: { authorization: `Bearer ${createToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Remote Direct Host' }),
        })
        const ticket = new URL(created.pairingUrl).hash.slice(1).split('ticket=')[1]
        if (!ticket) throw new Error('create response missing ticket')
        const claimed = await requestJson<{ wsUrl: string }>(`/pairings/${created.pairing.id}/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticket, label: 'Remote Direct Guest' }),
        })
        await requestJson(`/pairings/${created.pairing.id}/approve`, {
            method: 'POST',
            headers: { authorization: `Bearer ${created.hostToken}` },
        })

        const commonEnv = {
            BROKER_READY_URL: new URL('/ready', brokerUrl).toString(),
            ICE_SERVERS_JSON: JSON.stringify(created.iceServers),
            PEER_OPEN_TIMEOUT_MS: '30000',
            PING_COUNT: String(pingCount),
        }
        const remoteCommand = [
            `ROLE=guest`,
            `WS_URL=${quote(claimed.wsUrl)}`,
            `ICE_SERVERS_JSON=${quote(commonEnv.ICE_SERVERS_JSON)}`,
            `PING_COUNT=${quote(commonEnv.PING_COUNT)}`,
            'docker run --rm --network=host',
            '-e ROLE -e WS_URL -e ICE_SERVERS_JSON -e PING_COUNT',
            `-v ${quote(remoteDir)}:/work:ro`,
            '--entrypoint sh',
            quote(remotePythonImage),
            '-lc',
            quote('PYTHONPATH=/work/vendor python3 /work/endpoint.py'),
        ].join(' ')
        const localRun = spawnLogged('bun', [endpointScript], join(workDir, 'host.log'), {
            ...commonEnv,
            CHROME_EXECUTABLE_PATH: resolveChromeExecutablePath(),
            ROLE: 'host',
            WS_URL: created.wsUrl,
        })
        const remoteRun = spawnLogged('ssh', [remoteAlias, remoteCommand], join(workDir, 'guest-remote.log'))
        const outcomes = await Promise.allSettled([localRun, remoteRun])
        if (outcomes.some((outcome) => outcome.status === 'rejected')) {
            const reasons = outcomes.map((outcome) => (outcome.status === 'rejected' ? String(outcome.reason) : 'ok'))
            throw new Error(`remote direct endpoints failed: ${reasons.join(' | ')}`)
        }
        const outputs = outcomes.map((outcome) => {
            if (outcome.status === 'rejected') throw outcome.reason
            return outcome.value
        })
        const [host, guest] = outputs.map((output) => parseResult(output)) as [EndpointResult, EndpointResult]
        assertDirect(host)
        assertDirect(guest, false)
        assertDirectLatency(guest)
        const summary = {
            ok: true,
            brokerUrl,
            pingCount,
            host,
            guest,
            remoteAlias,
            remotePeer: 'aiortc',
            remotePythonImage,
            evidenceDir: workDir,
        }
        writeFileSync(join(workDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
        console.log(JSON.stringify(summary))
    } finally {
        run('ssh', [remoteAlias, `rm -rf ${quote(remoteDir)}`])
        if (process.env.VIBY_PAIRING_REMOTE_DIRECT_CLEAN_ARTIFACTS === '1')
            rmSync(workDir, { recursive: true, force: true })
        else console.log(`[harness] pairing remote direct artifacts kept at ${workDir}`)
    }
}

if (import.meta.main) await main()
