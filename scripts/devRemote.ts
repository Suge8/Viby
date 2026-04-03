import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
    buildRemoteDevContext,
    getDevRemoteLockPath,
    DEFAULT_REMOTE_HUB_PORT,
    DEFAULT_REMOTE_WEB_PORT,
    getAccessibleHosts,
    parseRemoteFlag,
    parseRemotePort,
    readActiveDevRemoteLock,
    removeDevRemoteLock,
    resolveVibyHome,
    writeDevRemoteLock,
    type RemoteDevContext,
} from './devRemoteHelpers'
import { buildUnexpectedChildExitOutcome } from './devRemoteSupervisor'

const DEV_REMOTE_SEPARATOR_WIDTH = 72
const HUB_LISTEN_HOST = '0.0.0.0'
const CHILD_STOP_TIMEOUT_MS = 3_000

type ManagedChild = {
    label: 'hub' | 'web'
    process: ChildProcess
}

type PortOwner = {
    pid: number
    command: string
}

function getRepoRoot(): string {
    return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function getRemoteContext(): RemoteDevContext {
    const hubPort = parseRemotePort(process.env.VIBY_REMOTE_HUB_PORT, DEFAULT_REMOTE_HUB_PORT)
    const vitePort = parseRemotePort(process.env.VIBY_REMOTE_WEB_PORT, DEFAULT_REMOTE_WEB_PORT)
    return buildRemoteDevContext(getAccessibleHosts(), { hubPort, vitePort })
}

function createHubArgs(hubWatch: boolean): string[] {
    if (hubWatch) {
        return ['--hot', '--no-clear-screen', 'run', 'src/devHot.ts']
    }

    return ['run', 'src/index.ts']
}

function createWebArgs(vitePort: number): string[] {
    const args = ['run', 'dev', '--', '--host', HUB_LISTEN_HOST, '--port', String(vitePort)]
    if (isStrictWebPortEnabled()) {
        args.push('--strictPort')
    }
    return args
}

function isStrictWebPortEnabled(): boolean {
    const raw = process.env.VIBY_REMOTE_STRICT_PORT
    if (raw == null) {
        return true
    }
    return parseRemoteFlag(raw)
}

function parseLsofPortOwners(raw: string): PortOwner[] {
    return raw
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/))
        .filter((parts) => parts.length >= 2)
        .map((parts) => ({
            command: parts[0],
            pid: Number.parseInt(parts[1] ?? '', 10)
        }))
        .filter((owner) => Number.isInteger(owner.pid) && owner.pid > 0)
}

function getPortOwners(port: number): PortOwner[] {
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8'
    })

    if (result.error || result.status === 1 || !result.stdout) {
        return []
    }

    return parseLsofPortOwners(result.stdout)
}

async function assertPortAvailable(port: number): Promise<void> {
    const server = createServer()

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen({
            host: HUB_LISTEN_HOST,
            port,
            exclusive: true
        }, () => {
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve()
            })
        })
    })
}

function formatPortConflict(label: string, port: number): string {
    const owners = getPortOwners(port)
    if (owners.length === 0) {
        return `  - ${label} ${port}: already in use`
    }

    const ownerSummary = owners
        .map((owner) => `${owner.command} (pid ${owner.pid})`)
        .join(', ')
    return `  - ${label} ${port}: ${ownerSummary}`
}

async function ensureSingleRemoteOwner(repoRoot: string, context: RemoteDevContext): Promise<void> {
    const activeLock = readActiveDevRemoteLock(repoRoot)
    if (activeLock && activeLock.pid !== process.pid) {
        throw new Error([
            'Another Viby dev:remote instance is already running for this repo.',
            `  - pid: ${activeLock.pid}`,
            `  - hub port: ${activeLock.hubPort}`,
            `  - web port: ${activeLock.vitePort}`,
            `  - lock: ${getDevRemoteLockPath(repoRoot)}`,
            'Stop that instance before starting a new one.'
        ].join('\n'))
    }

    const conflicts: string[] = []
    for (const [label, port] of [
        ['hub', context.hubPort],
        ['web', context.vitePort],
    ] as const) {
        try {
            await assertPortAvailable(port)
        } catch {
            conflicts.push(formatPortConflict(label, port))
        }
    }

    if (conflicts.length > 0) {
        throw new Error([
            'dev:remote cannot start because required ports are already occupied.',
            ...conflicts,
            'Stop the existing owner first, then rerun `bun run dev:remote`.'
        ].join('\n'))
    }
}

function spawnManagedChild(options: {
    label: 'hub' | 'web'
    cwd: string
    args: string[]
    env: NodeJS.ProcessEnv
}): ManagedChild {
    const child = spawn('bun', options.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: 'inherit',
    })

    return {
        label: options.label,
        process: child,
    }
}

function formatExit(code: number | null, signal: NodeJS.Signals | null): string {
    const codeLabel = code === null ? 'null' : String(code)
    const signalLabel = signal ?? 'none'
    return `code=${codeLabel}, signal=${signalLabel}`
}

function printStartupSummary(context: RemoteDevContext, hubWatch: boolean): void {
    const strictWebPort = isStrictWebPortEnabled()
    console.log('')
    console.log('='.repeat(DEV_REMOTE_SEPARATOR_WIDTH))
    console.log('Viby Remote Dev')
    console.log('='.repeat(DEV_REMOTE_SEPARATOR_WIDTH))
    console.log(`[hub] mode: ${hubWatch ? 'watch' : 'stable'}`)
    console.log(`[hub] port: ${context.hubPort}`)
    console.log(`[web] port: ${context.vitePort}`)
    console.log(`[hub] CORS origins: ${context.webOrigins.join(', ')}`)
    console.log('')
    console.log('Recommended remote URLs:')
    for (const url of context.remoteDevUrls) {
        console.log(`  ${url}`)
    }
    console.log('')
    console.log('Direct hub URLs:')
    for (const url of context.directHubUrls) {
        console.log(`  ${url}`)
    }
    console.log('')
    console.log('Notes:')
    console.log('  - Default mode keeps hub stable; only web runs HMR.')
    console.log('  - If you need hub auto-reload too, set VIBY_REMOTE_HUB_WATCH=1; hub will reload runtime in-place via bun --hot.')
    console.log(`  - Web port policy: ${strictWebPort ? 'strict/fixed' : 'auto-increment when occupied'}.`)
    console.log('  - Ctrl+C stops both child processes.')
    console.log('='.repeat(DEV_REMOTE_SEPARATOR_WIDTH))
    console.log('')
}

async function stopChild(child: ManagedChild): Promise<void> {
    const target = child.process
    if (target.exitCode !== null || target.signalCode !== null) {
        return
    }

    target.kill('SIGTERM')
    const exited = await Promise.race([
        new Promise<boolean>((resolve) => {
            target.once('exit', () => resolve(true))
        }),
        sleep(CHILD_STOP_TIMEOUT_MS, false)
    ])
    if (exited === true) {
        return
    }

    target.kill('SIGKILL')
    await Promise.race([
        new Promise<void>((resolve) => {
            target.once('exit', () => resolve())
        }),
        sleep(CHILD_STOP_TIMEOUT_MS)
    ])
}

async function main(): Promise<void> {
    const repoRoot = getRepoRoot()
    const context = getRemoteContext()
    const hubWatch = parseRemoteFlag(process.env.VIBY_REMOTE_HUB_WATCH)
    const vibyHome = resolveVibyHome(process.env.VIBY_HOME, repoRoot)
    const settingsFile = join(vibyHome, 'settings.toml')
    await ensureSingleRemoteOwner(repoRoot, context)

    const hubEnv: NodeJS.ProcessEnv = {
        ...process.env,
        VIBY_HOME: vibyHome,
        VIBY_LISTEN_HOST: HUB_LISTEN_HOST,
        VIBY_LISTEN_PORT: String(context.hubPort),
        CORS_ORIGINS: context.webOrigins.join(','),
    }
    const webEnv: NodeJS.ProcessEnv = {
        ...process.env,
        VIBY_HOME: vibyHome,
        VITE_HUB_PROXY: context.hubProxyUrl,
    }
    writeDevRemoteLock(repoRoot, {
        pid: process.pid,
        repoRoot,
        hubPort: context.hubPort,
        vitePort: context.vitePort,
        createdAt: new Date().toISOString()
    })
    process.on('exit', () => {
        removeDevRemoteLock(repoRoot, process.pid)
    })

    printStartupSummary(context, hubWatch)
    console.log(`[dev:remote] VIBY_HOME: ${vibyHome}`)
    console.log(`[dev:remote] settings: ${settingsFile}`)
    console.log('[dev:remote] auth: reuses your default ~/.viby token by default; set VIBY_HOME=.viby-devremote if you want an isolated dev token')
    console.log('')

    const children: ManagedChild[] = [
        spawnManagedChild({
            label: 'hub',
            cwd: join(repoRoot, 'hub'),
            args: createHubArgs(hubWatch),
            env: hubEnv,
        }),
        spawnManagedChild({
            label: 'web',
            cwd: join(repoRoot, 'web'),
            args: createWebArgs(context.vitePort),
            env: webEnv,
        }),
    ]

    let shuttingDown = false
    let exitCode = 0
    const shutdown = async (): Promise<void> => {
        if (shuttingDown) {
            return
        }
        shuttingDown = true
        await Promise.all(children.map((child) => stopChild(child)))
        process.exit(exitCode)
    }

    process.on('SIGINT', () => {
        void shutdown()
    })
    process.on('SIGTERM', () => {
        void shutdown()
    })

    for (const child of children) {
        child.process.on('error', (error) => {
            exitCode = 1
            console.error(`[${child.label}] failed to start:`, error)
        })

        child.process.on('exit', (code, signal) => {
            const details = formatExit(code, signal)

            if (shuttingDown) {
                console.log(`[${child.label}] exited (${details})`)
                return
            }

            const outcome = buildUnexpectedChildExitOutcome(child.label, details, code)
            exitCode = outcome.exitCode
            console.error(outcome.message)
            void shutdown()
        })
    }

    await new Promise<void>(() => {})
}

void main().catch((error) => {
    console.error('[dev:remote] fatal error:', error)
    process.exit(1)
})
