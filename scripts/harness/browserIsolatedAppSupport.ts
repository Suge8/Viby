import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { type BrowserContext, type CDPSession, chromium, type Page } from 'playwright-core'
import { wireBrowserObservability } from './appLikeRouteBrowserProbeSupport'
import { resolveChromeExecutablePath } from './browserSmokeRuntime'
import type {
    BrowserConsoleEvent,
    BrowserLogEntry,
    BrowserNetworkFailure,
    BrowserRuntimeException,
} from './browserSmokeSupport'

const PROCESS_KILL_TIMEOUT_MS = 5_000
const HTTP_OK_POLL_INTERVAL_MS = 500
const OBSERVED_MOBILE_VIEWPORT = { width: 393, height: 852 } as const
const OBSERVED_DESKTOP_VIEWPORT = { width: 1440, height: 960 } as const
const OBSERVED_BROWSER_ARGS = [
    '--disable-background-networking',
    '--disable-component-update',
    '--no-first-run',
    '--no-default-browser-check',
] as const

export type StartedProcess = {
    child: ChildProcess
    logPath: string
}

export type BrowserObservabilityBuckets = {
    consoleErrors: BrowserConsoleEvent[]
    logErrors: BrowserLogEntry[]
    networkFailures: BrowserNetworkFailure[]
    networkRequests: string[]
    runtimeExceptions: BrowserRuntimeException[]
}

export type IsolatedBrowserApp = {
    browserProfileDir: string
    hubProcess: StartedProcess
    hubUrl: string
    vibyHomeDir: string
    webProcess: StartedProcess
    webUrl: string
}

export type ObservedMobileBrowser = {
    cdp: CDPSession
    context: BrowserContext
    page: Page
}

export async function reserveFreePort(): Promise<number> {
    return await new Promise<number>((resolvePort, reject) => {
        const server = createServer()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('Failed to reserve a free port')))
                return
            }

            const { port } = address
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolvePort(port)
            })
        })
    })
}

export function startLoggedProcess(options: {
    repoRoot: string
    args: string[]
    env?: NodeJS.ProcessEnv
    logPath: string
}): StartedProcess {
    const logFd = openSync(options.logPath, 'w')
    const child = spawn('bun', options.args, {
        cwd: options.repoRoot,
        env: {
            ...process.env,
            ...options.env,
        },
        stdio: ['ignore', logFd, logFd],
    })

    child.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
            console.error(`[smoke] process exited non-zero (${code}) for ${options.logPath}`)
        }
        if (signal) {
            console.error(`[smoke] process exited via signal ${signal} for ${options.logPath}`)
        }
    })

    return {
        child,
        logPath: options.logPath,
    }
}

export async function stopProcess(processRef: StartedProcess | null): Promise<void> {
    if (!processRef || processRef.child.exitCode !== null || processRef.child.killed) {
        return
    }

    processRef.child.kill('SIGTERM')
    await new Promise<void>((resolveExit) => {
        processRef.child.once('exit', () => resolveExit())
        setTimeout(() => {
            processRef.child.kill('SIGKILL')
            resolveExit()
        }, PROCESS_KILL_TIMEOUT_MS).unref?.()
    })
}

export async function waitForHttpOk(
    url: string,
    timeoutMs: number,
    pollMs: number = HTTP_OK_POLL_INTERVAL_MS
): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url)
            if (response.ok) {
                return
            }
        } catch {
            // Keep polling until the service is ready.
        }

        await new Promise((resolve) => setTimeout(resolve, pollMs))
    }

    throw new Error(`Timed out waiting for ${url}`)
}

export async function postJson<TResponse>(
    url: string,
    options: {
        headers?: Record<string, string>
        body: unknown
    }
): Promise<TResponse> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...options.headers,
        },
        body: JSON.stringify(options.body),
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Request failed ${response.status} ${response.statusText}: ${body}`)
    }

    return (await response.json()) as TResponse
}

export async function getJson<TResponse>(
    url: string,
    options?: {
        headers?: Record<string, string>
    }
): Promise<TResponse> {
    const response = await fetch(url, {
        headers: options?.headers,
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Request failed ${response.status} ${response.statusText}: ${body}`)
    }

    return (await response.json()) as TResponse
}

export async function startIsolatedBrowserApp(options: {
    cliApiToken: string
    hubReadyTimeoutMs: number
    outputDir: string
    repoRoot: string
    webReadyTimeoutMs: number
}): Promise<IsolatedBrowserApp> {
    mkdirSync(options.outputDir, { recursive: true })
    const vibyHomeDir = join(options.outputDir, 'viby-home')
    const browserProfileDir = join(options.outputDir, 'browser-profile')
    mkdirSync(vibyHomeDir, { recursive: true })
    mkdirSync(browserProfileDir, { recursive: true })

    const hubPort = await reserveFreePort()
    const webPort = await reserveFreePort()
    const hubUrl = `http://127.0.0.1:${hubPort}`
    const webUrl = `http://127.0.0.1:${webPort}`

    const hubProcess = startLoggedProcess({
        repoRoot: options.repoRoot,
        args: ['run', '--cwd', 'hub', 'start'],
        env: {
            CLI_API_TOKEN: options.cliApiToken,
            CORS_ORIGINS: webUrl,
            VIBY_HOME: vibyHomeDir,
            VIBY_LISTEN_HOST: '127.0.0.1',
            VIBY_LISTEN_PORT: String(hubPort),
        },
        logPath: join(options.outputDir, 'hub.log'),
    })
    await waitForHttpOk(`${hubUrl}/health`, options.hubReadyTimeoutMs)

    const webProcess = startLoggedProcess({
        repoRoot: options.repoRoot,
        args: ['run', '--cwd', 'web', 'dev', '--', '--host', '127.0.0.1', '--port', String(webPort)],
        env: {
            VIBY_HOME: vibyHomeDir,
            VIBY_LISTEN_HOST: '127.0.0.1',
            VIBY_LISTEN_PORT: String(hubPort),
        },
        logPath: join(options.outputDir, 'web.log'),
    })
    await waitForHttpOk(webUrl, options.webReadyTimeoutMs)

    return {
        browserProfileDir,
        hubProcess,
        hubUrl,
        vibyHomeDir,
        webProcess,
        webUrl,
    }
}

export async function launchObservedMobileBrowser(options: {
    browserProfileDir: string
    buckets: BrowserObservabilityBuckets
    outputDir: string
}): Promise<ObservedMobileBrowser> {
    return await launchObservedBrowser({
        ...options,
        hasTouch: true,
        isMobile: true,
        viewport: OBSERVED_MOBILE_VIEWPORT,
    })
}

export async function launchObservedDesktopBrowser(options: {
    browserProfileDir: string
    buckets: BrowserObservabilityBuckets
    outputDir: string
}): Promise<ObservedMobileBrowser> {
    return await launchObservedBrowser({
        ...options,
        hasTouch: false,
        isMobile: false,
        viewport: OBSERVED_DESKTOP_VIEWPORT,
    })
}

async function launchObservedBrowser(options: {
    browserProfileDir: string
    buckets: BrowserObservabilityBuckets
    hasTouch: boolean
    isMobile: boolean
    outputDir: string
    viewport: { width: number; height: number }
}): Promise<ObservedMobileBrowser> {
    const context = await chromium.launchPersistentContext(options.browserProfileDir, {
        executablePath: resolveChromeExecutablePath(),
        headless: true,
        viewport: options.viewport,
        isMobile: options.isMobile,
        hasTouch: options.hasTouch,
        ignoreHTTPSErrors: true,
        recordHar: {
            path: join(options.outputDir, 'network.har'),
            mode: 'minimal',
        },
        args: [...OBSERVED_BROWSER_ARGS],
    })
    const page = context.pages()[0] ?? (await context.newPage())
    const cdp = await context.newCDPSession(page)
    wireBrowserObservability(cdp, options.buckets)

    return { cdp, context, page }
}
