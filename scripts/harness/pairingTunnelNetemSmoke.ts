import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(dirname(scriptDir))
const bundleDir = join(repoRoot, 'pairing', 'deploy-bundle')
const clientScript = join(scriptDir, 'pairingTunnelNetemClient.mjs')
const defaultImage = 'oven/bun:1.3.11-alpine'
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
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed\n${result.stderr || result.stdout}`)
    }
    return result.stdout
}

async function pickPort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = net.createServer()
        server.on('error', reject)
        server.listen(0, '0.0.0.0', () => {
            const address = server.address()
            server.close(() => {
                if (!address || typeof address === 'string') reject(new Error('failed to allocate port'))
                else resolve(address.port)
            })
        })
    })
}

function dockerAvailable(): boolean {
    return run('docker', ['info']).status === 0
}

function ensureBundle(): void {
    const runScript = join(bundleDir, 'run-pairing.sh')
    if (!existsSync(runScript)) {
        throw new Error("Missing pairing deploy bundle. Run 'bun run build:pairing' first.")
    }
}

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function waitForBroker(port: number): void {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 20_000) {
        const result = run('curl', ['-fsS', `http://127.0.0.1:${port}/ready`])
        if (result.status === 0) return
        sleepSync(500)
    }
    throw new Error('pairing broker did not become ready')
}

function waitForPublicBroker(brokerUrl: string): void {
    const startedAt = Date.now()
    const readyUrl = new URL('/ready', brokerUrl).toString()
    while (Date.now() - startedAt < 20_000) {
        const result = run('curl', ['-fsS', readyUrl])
        if (result.status === 0) return
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
            'PAIRING_HOST=0.0.0.0',
            `PAIRING_PORT=${port}`,
            `PAIRING_PUBLIC_URL=http://host.docker.internal:${port}`,
            `PAIRING_CREATE_TOKEN=${createToken}`,
            'PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS=60',
            '',
        ].join('\n')
    )
    const log = Bun.file(join(workDir, 'pairing.log')).writer()
    const child = spawn(join(installDir, 'run-pairing.sh'), {
        cwd: installDir,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (chunk) => log.write(chunk))
    child.stderr?.on('data', (chunk) => log.write(chunk))
    waitForBroker(port)
    return child
}

function stopProcess(child: ChildProcess | null): void {
    if (!child || child.killed) return
    child.kill('SIGTERM')
}

function dockerRunArgs(
    network: string,
    workDir: string,
    role: 'host' | 'guest',
    brokerUrl: string,
    createToken: string
) {
    const netemDisabled = process.env.VIBY_PAIRING_NETEM_PROFILE === 'none'
    const netem =
        role === 'host'
            ? 'tc qdisc add dev eth0 root netem delay 25ms 5ms loss 0.2%'
            : 'tc qdisc add dev eth0 root netem delay 90ms 30ms loss 1%'
    const setup = netemDisabled ? 'true' : `apk add --no-cache iproute2 >/dev/null && ${netem}`
    return [
        'run',
        '--rm',
        '--cap-add',
        'NET_ADMIN',
        '--network',
        network,
        '--add-host',
        'host.docker.internal:host-gateway',
        '-v',
        `${workDir}:/shared`,
        '-v',
        `${clientScript}:/smoke/client.mjs:ro`,
        '-e',
        `BROKER_URL=${brokerUrl}`,
        '-e',
        `PAIRING_CREATE_TOKEN=${createToken}`,
        '-e',
        'SHARED_DIR=/shared',
        '-e',
        `PING_COUNT=${process.env.PING_COUNT || '24'}`,
        '-e',
        `PING_TIMEOUT_MS=${process.env.PING_TIMEOUT_MS || '5000'}`,
        '-e',
        `NETEM_HANDOVER=${process.env.NETEM_HANDOVER || '1'}`,
        '-e',
        `NETEM_BLACKHOLE_MS=${process.env.NETEM_BLACKHOLE_MS || '1500'}`,
        '-e',
        `REOPEN_GUEST_TUNNEL=${process.env.REOPEN_GUEST_TUNNEL || '1'}`,
        defaultImage,
        'sh',
        '-lc',
        `${setup} && bun /smoke/client.mjs ${role}`,
    ]
}

async function runContainer(
    network: string,
    workDir: string,
    role: 'host' | 'guest',
    brokerUrl: string,
    createToken: string
): Promise<void> {
    const logPath = join(workDir, `${role}.log`)
    const child = spawn('docker', dockerRunArgs(network, workDir, role, brokerUrl, createToken), {
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    const log = Bun.file(logPath).writer()
    child.stdout?.on('data', (chunk) => log.write(chunk))
    child.stderr?.on('data', (chunk) => log.write(chunk))
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve))
    await log.end()
    if (code !== 0) throw new Error(`${role} container failed; see ${logPath}`)
}

function writeSummary(workDir: string, network: string, brokerUrl: string): void {
    const resultPath = join(workDir, 'result.json')
    if (!existsSync(resultPath)) {
        throw new Error(`guest result missing; inspect ${join(workDir, 'guest.log')} and ${join(workDir, 'host.log')}`)
    }
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as Record<string, unknown>
    const summary = {
        ...result,
        network,
        brokerUrl,
        evidenceDir: workDir,
    }
    writeFileSync(join(workDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(JSON.stringify(summary))
    assertLatency(summary)
}

function assertLatency(summary: Record<string, unknown>): void {
    const fallback = process.argv.includes('--public') ? 1_500 : 1_000
    const maxP95 = Number.parseInt(process.env.MAX_P95_RTT_MS || String(fallback), 10)
    const p95 = typeof summary.p95RttMs === 'number' ? summary.p95RttMs : null
    if (p95 !== null && p95 > maxP95) {
        throw new Error(`pairing relay p95 ${p95}ms exceeded ${maxP95}ms`)
    }
}

function redactEvidence(workDir: string): void {
    for (const fileName of ['pairing.log', 'session.json']) {
        const path = join(workDir, fileName)
        if (!existsSync(path)) continue
        const redacted = readFileSync(path, 'utf8')
            .replace(/(token=)[A-Za-z0-9_-]+/g, '$1<redacted>')
            .replace(/("ticket"\s*:\s*")[^"]+"/g, '$1<redacted>"')
            .replace(/("hostTunnelUrl"\s*:\s*")[^"]+"/g, '$1<redacted>"')
        writeFileSync(path, redacted)
    }
}

function createEvidenceDir(): string {
    const artifactRoot = join(repoRoot, '.artifacts', 'harness')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const prefix = process.argv.includes('--public') ? 'pairing-prod-relay' : 'pairing-netem'
    const workDir = join(artifactRoot, `${prefix}-${stamp}`)
    mkdirSync(workDir, { recursive: true })
    return workDir
}

async function main(): Promise<void> {
    const publicMode = process.argv.includes('--public')
    if (!dockerAvailable()) {
        if (process.env.VIBY_PAIRING_NETEM_SKIP_IF_UNAVAILABLE === '1') {
            console.log('[harness] pairing netem smoke skipped: docker daemon unavailable')
            return
        }
        throw new Error('Docker daemon is unavailable. Start Docker/Colima before running pairing netem smoke.')
    }
    if (!publicMode) ensureBundle()
    const port = publicMode ? 0 : await pickPort()
    const createToken = publicMode ? (process.env.PAIRING_CREATE_TOKEN ?? '') : `netem-${Date.now()}`
    if (publicMode && !createToken) throw new Error('PAIRING_CREATE_TOKEN is required for public relay smoke')
    const workDir = createEvidenceDir()
    const network = `viby-pairing-netem-${Date.now()}`
    let broker: ChildProcess | null = null
    try {
        runChecked('docker', ['network', 'create', network])
        const brokerUrl = publicMode ? publicBrokerUrl : `http://host.docker.internal:${port}`
        if (publicMode) waitForPublicBroker(brokerUrl)
        else broker = startBroker(workDir, port, createToken)
        await Promise.all([
            runContainer(network, workDir, 'host', brokerUrl, createToken),
            runContainer(network, workDir, 'guest', brokerUrl, createToken),
        ])
        writeSummary(workDir, network, brokerUrl)
    } finally {
        stopProcess(broker)
        run('docker', ['network', 'rm', network])
        if (process.env.VIBY_PAIRING_NETEM_CLEAN_ARTIFACTS === '1') {
            rmSync(workDir, { force: true, recursive: true })
        } else {
            redactEvidence(workDir)
            console.log(`[harness] pairing netem artifacts kept at ${workDir}`)
        }
    }
}

if (import.meta.main) {
    await main()
}
