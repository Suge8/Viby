import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const READY_TIMEOUT_MS = 60_000
const EXIT_TIMEOUT_MS = 20_000
const PORT_RELEASE_TIMEOUT_MS = 20_000
const MAX_LOG_CAPTURE_BYTES = 256_000
const DESKTOP_PROCESS_NAMES = ['Viby', 'viby'] as const
const SECRET_LOG_PATTERNS: readonly RegExp[] = [/[?&]token=[A-Za-z0-9_-]+/]
const FATAL_LOG_PATTERNS: readonly RegExp[] = [
    /No such file or directory/i,
    /os error 2/i,
    /Failed to spawn/i,
    /\bpanic(?:ked)?\b/i,
    /Unhandled(?:PromiseRejection| exception)?/i,
    /\bEADDRINUSE\b/i,
]

export type RuntimeStatus = {
    phase?: string
    pid?: number
    localHubUrl?: string
    listenPort?: number
    hubOwnerToken?: string
}

export type DesktopLifecycleLogIssue = {
    source: string
    line: number
    text: string
}

export type DesktopLifecycleReport = {
    appBinary: string
    fakeHome: string
    status: RuntimeStatus | null
    port: number
    health: unknown
    logPaths: Record<string, string>
    logIssues: DesktopLifecycleLogIssue[]
    completedAt: string
}

export async function reserveTcpPort(): Promise<number> {
    return await new Promise((resolvePort, reject) => {
        const server = createServer()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('Failed to reserve a local port')))
                return
            }
            server.close((error) => (error ? reject(error) : resolvePort(address.port)))
        })
    })
}

export function readRuntimeStatus(statusPath: string): RuntimeStatus | null {
    if (!existsSync(statusPath)) return null
    return JSON.parse(readFileSync(statusPath, 'utf8')) as RuntimeStatus
}

export function isPidAlive(pid: number | undefined): boolean {
    if (!Number.isFinite(pid) || (pid ?? 0) <= 0) return false
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export function assertNoExistingDesktopProcess(): void {
    if (process.env.VIBY_DESKTOP_SMOKE_ALLOW_EXISTING === '1' || process.platform === 'win32') return
    const matches: string[] = []
    for (const name of DESKTOP_PROCESS_NAMES) {
        const result = spawnSync('pgrep', ['-x', name], { encoding: 'utf8' })
        if (result.status === 0 && result.stdout.trim()) matches.push(`${name}: ${result.stdout.trim()}`)
    }
    if (matches.length > 0) {
        throw new Error(`Refusing desktop smoke while another Viby process is running: ${matches.join('; ')}`)
    }
}

export async function waitForReadyStatus(statusPath: string, child?: ChildProcess): Promise<RuntimeStatus> {
    return await new Promise((resolveReady, reject) => {
        let settled = false
        const timeout = setTimeout(() => {
            stop()
            reject(new Error(`Timed out waiting for AppCore ready status: ${statusPath}`))
        }, READY_TIMEOUT_MS)
        const watcher = watch(dirname(statusPath), (_event, fileName) => {
            if (!fileName || fileName.toString() === 'hub.runtime-status.json') tryResolve()
        })
        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            stop()
            reject(new Error(`Desktop exited before AppCore ready: code=${code ?? 'null'} signal=${signal ?? 'null'}`))
        }
        const stop = () => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            watcher.close()
            child?.off('exit', onExit)
        }
        const tryResolve = () => {
            if (settled) return
            const status = readRuntimeStatus(statusPath)
            if (status?.phase !== 'ready' || !isPidAlive(status.pid)) return
            stop()
            resolveReady(status)
        }

        timeout.unref?.()
        child?.once('exit', onExit)
        tryResolve()
    })
}

export async function waitForPidExit(pid: number | undefined): Promise<void> {
    const deadline = Date.now() + EXIT_TIMEOUT_MS
    // External child PID is owned by Desktop, not this smoke; Node has no exit event for it.
    while (Date.now() < deadline) {
        if (!isPidAlive(pid)) return
        await delay(250)
    }
    throw new Error(`Timed out waiting for PID exit: ${pid}`)
}

export async function waitForPortClosed(port: number): Promise<void> {
    const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS
    // OS TCP listen state has no portable event API; bounded connect probe verifies release.
    while (Date.now() < deadline) {
        if (!(await canConnect(port))) return
        await delay(250)
    }
    throw new Error(`Timed out waiting for port release: ${port}`)
}

export async function stopDesktop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.killed) return
    child.kill('SIGTERM')
    await new Promise<void>((resolveExit) => {
        const timeout = setTimeout(() => {
            child.kill('SIGKILL')
            resolveExit()
        }, EXIT_TIMEOUT_MS)
        timeout.unref?.()
        child.once('exit', () => {
            clearTimeout(timeout)
            resolveExit()
        })
    })
}

function appendCapped(current: string, chunk: Buffer): string {
    const next = current + chunk.toString('utf8')
    return next.length <= MAX_LOG_CAPTURE_BYTES ? next : next.slice(next.length - MAX_LOG_CAPTURE_BYTES)
}

function redactLogSecrets(text: string): string {
    return text
        .replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1<redacted>')
        .replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer <redacted>')
}

function redactRuntimeStatus(status: RuntimeStatus | null): RuntimeStatus | null {
    return status?.hubOwnerToken ? { ...status, hubOwnerToken: '<redacted>' } : status
}

export function findDesktopLifecycleLogIssues(logs: Record<string, string>): DesktopLifecycleLogIssue[] {
    const issues: DesktopLifecycleLogIssue[] = []
    for (const [source, raw] of Object.entries(logs)) {
        const rawLines = raw.split(/\r?\n/)
        const redactedLines = redactLogSecrets(raw).split(/\r?\n/)
        rawLines.forEach((rawLine, index) => {
            const redactedLine = redactedLines[index] ?? '<redacted>'
            if (
                SECRET_LOG_PATTERNS.some((pattern) => pattern.test(rawLine)) ||
                FATAL_LOG_PATTERNS.some((pattern) => pattern.test(redactedLine))
            ) {
                issues.push({ source, line: index + 1, text: redactedLine })
            }
        })
    }
    return issues
}

export async function runDesktopLifecycleSmoke(options: {
    appBinary: string
    cwd: string
    outputDir: string
    reportName: string
}): Promise<string> {
    const fakeHome = await mkdtemp(join(tmpdir(), 'viby-desktop-smoke-home.'))
    const vibyHome = join(fakeHome, '.viby')
    mkdirSync(vibyHome, { recursive: true })
    const port = await reserveTcpPort()
    writeFileSync(join(vibyHome, 'settings.toml'), `listen_host = "127.0.0.1"\nlisten_port = ${port}\n`)
    mkdirSync(options.outputDir, { recursive: true })

    const child = spawn(options.appBinary, [], {
        cwd: options.cwd,
        env: { ...process.env, HOME: fakeHome, VIBY_HOME: vibyHome, VIBY_DESKTOP_SMOKE_AUTOSTART: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
        stdout = appendCapped(stdout, chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
        stderr = appendCapped(stderr, chunk)
    })
    const statusPath = join(vibyHome, 'hub.runtime-status.json')
    let status: RuntimeStatus | null = null
    let healthBody: unknown = null
    let smokeFailure: unknown = null
    try {
        status = await waitForReadyStatus(statusPath, child)
        const healthUrl = `${status.localHubUrl ?? `http://127.0.0.1:${status.listenPort ?? port}`}/health`
        const health = await fetch(healthUrl)
        if (!health.ok) throw new Error(`Hub health failed: ${health.status}`)
        healthBody = await health.json()
        await stopDesktop(child)
        await waitForPidExit(status.pid)
        await waitForPortClosed(status.listenPort ?? port)
    } catch (error) {
        smokeFailure = error
    } finally {
        await stopDesktop(child)
    }

    const appCoreLogPath = join(vibyHome, 'logs', 'desktop-app-core.log')
    const logs = {
        'desktop.stdout': stdout,
        'desktop.stderr': stderr,
        'desktop-app-core.log': existsSync(appCoreLogPath) ? readFileSync(appCoreLogPath, 'utf8') : '',
    }
    const logPaths = {
        stdout: join(options.outputDir, 'desktop.stdout.log'),
        stderr: join(options.outputDir, 'desktop.stderr.log'),
        appCore: join(options.outputDir, 'desktop-app-core.log'),
    }
    writeFileSync(logPaths.stdout, redactLogSecrets(logs['desktop.stdout']))
    writeFileSync(logPaths.stderr, redactLogSecrets(logs['desktop.stderr']))
    writeFileSync(logPaths.appCore, redactLogSecrets(logs['desktop-app-core.log']))
    const logIssues = findDesktopLifecycleLogIssues(logs)
    const report: DesktopLifecycleReport = {
        appBinary: options.appBinary,
        fakeHome,
        status: redactRuntimeStatus(status),
        port,
        health: healthBody,
        logPaths,
        logIssues,
        completedAt: new Date().toISOString(),
    }
    const reportPath = join(options.outputDir, options.reportName)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    if (logIssues.length > 0) {
        throw new Error(`Desktop lifecycle log gate failed. Report: ${reportPath}`)
    }
    if (smokeFailure) {
        const message = smokeFailure instanceof Error ? smokeFailure.message : String(smokeFailure)
        throw new Error(`Desktop lifecycle smoke failed. Report: ${reportPath}. Cause: ${message}`)
    }
    return reportPath
}

async function canConnect(port: number): Promise<boolean> {
    return await new Promise((resolveConnect) => {
        const socket = connect({ host: '127.0.0.1', port })
        socket.once('connect', () => {
            socket.destroy()
            resolveConnect(true)
        })
        socket.once('error', () => resolveConnect(false))
        socket.setTimeout(500, () => {
            socket.destroy()
            resolveConnect(false)
        })
    })
}

function delay(ms: number): Promise<void> {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}
