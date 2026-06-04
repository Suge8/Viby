import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type BrowserConsoleEvent = {
    type?: string
    args?: unknown[]
}

export type BrowserRuntimeException = {
    text?: string
}

export type BrowserLogEntry = {
    level?: string
    text?: string
}

export type BrowserNetworkFailure = {
    errorText?: string
    canceled?: boolean
}

export type BrowserControllerTraceEvent = {
    type?: string
    at?: number
    surface?: string
    controller?: string
    activeControllers?: string[]
}

type CdpEvent = {
    method: string
    params?: Record<string, unknown>
    sessionId?: string
}

type TargetInfo = {
    targetId: string
    type?: string
    url?: string
}

export class CdpClient {
    private readonly socket: WebSocket
    private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
    private readonly events: CdpEvent[] = []
    private nextId = 0

    private constructor(socket: WebSocket) {
        this.socket = socket
    }

    static async connect(url: string): Promise<CdpClient> {
        const socket = new WebSocket(url)
        await new Promise<void>((resolve, reject) => {
            socket.addEventListener('open', () => resolve(), { once: true })
            socket.addEventListener('error', () => reject(new Error(`failed to connect to CDP: ${url}`)), {
                once: true,
            })
        })

        const client = new CdpClient(socket)
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as {
                id?: number
                result?: unknown
                error?: { message?: string }
                method?: string
                params?: Record<string, unknown>
                sessionId?: string
            }

            if (typeof message.id === 'number') {
                const pending = client.pending.get(message.id)
                if (!pending) {
                    return
                }
                client.pending.delete(message.id)
                if (message.error) {
                    pending.reject(new Error(message.error.message || 'unknown CDP error'))
                    return
                }
                pending.resolve(message.result)
                return
            }

            if (message.method) {
                client.events.push({
                    method: message.method,
                    params: message.params,
                    sessionId: message.sessionId,
                })
            }
        })

        return client
    }

    async send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
        const id = ++this.nextId
        this.socket.send(JSON.stringify({ id, method, params, sessionId }))
        return await new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
        })
    }

    drainEvents(): CdpEvent[] {
        return this.events.splice(0, this.events.length)
    }

    close(): void {
        this.socket.close()
    }
}

type AgentBrowserOptions = {
    profileDir?: string
}

function buildAgentBrowserArgs(args: string[], options?: AgentBrowserOptions): string[] {
    if (!options?.profileDir) {
        return args
    }

    return ['--profile', options.profileDir, ...args]
}

export function runAgentBrowser(repoRoot: string, args: string[], options?: AgentBrowserOptions): string {
    const result = spawnSync('agent-browser', buildAgentBrowserArgs(args, options), {
        cwd: repoRoot,
        encoding: 'utf8',
    })

    if (result.status !== 0) {
        const stderr = result.stderr?.trim()
        const stdout = result.stdout?.trim()
        const renderedArgs = buildAgentBrowserArgs(args, options)
        throw new Error(`agent-browser ${renderedArgs.join(' ')} failed\n${stderr || stdout || 'unknown error'}`)
    }

    return result.stdout.trim()
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function attachToPageTarget(client: CdpClient): Promise<string> {
    const targetResult = (await client.send('Target.getTargets')) as {
        targetInfos?: TargetInfo[]
    }
    const targets = targetResult.targetInfos ?? []
    const pageTarget =
        targets.find((target) => target.type === 'page' && target.url === 'about:blank') ??
        targets.find((target) => target.type === 'page' && target.url) ??
        targets.find((target) => target.type === 'page')

    if (!pageTarget?.targetId) {
        throw new Error('failed to find page target for browser smoke')
    }

    const attachResult = (await client.send('Target.attachToTarget', {
        targetId: pageTarget.targetId,
        flatten: true,
    })) as { sessionId?: string }

    if (!attachResult.sessionId) {
        throw new Error(`failed to attach to target ${pageTarget.targetId}`)
    }

    return attachResult.sessionId
}

export function collectBrowserFailures(options: { client: CdpClient; sessionId: string }): {
    consoleErrors: BrowserConsoleEvent[]
    runtimeExceptions: BrowserRuntimeException[]
    logErrors: BrowserLogEntry[]
    networkFailures: BrowserNetworkFailure[]
} {
    const consoleErrors: BrowserConsoleEvent[] = []
    const runtimeExceptions: BrowserRuntimeException[] = []
    const logErrors: BrowserLogEntry[] = []
    const networkFailures: BrowserNetworkFailure[] = []

    for (const event of options.client.drainEvents()) {
        if (event.sessionId !== options.sessionId) {
            continue
        }

        if (event.method === 'Runtime.consoleAPICalled') {
            const payload = event.params as BrowserConsoleEvent | undefined
            if (payload?.type === 'error' || payload?.type === 'assert') {
                consoleErrors.push(payload)
            }
            continue
        }

        if (event.method === 'Runtime.exceptionThrown') {
            const details = (event.params?.exceptionDetails as { text?: string } | undefined) ?? {}
            runtimeExceptions.push({ text: details.text })
            continue
        }

        if (event.method === 'Log.entryAdded') {
            const entry = (event.params?.entry as BrowserLogEntry | undefined) ?? {}
            if (entry.level === 'error') {
                logErrors.push(entry)
            }
            continue
        }

        if (event.method === 'Network.loadingFailed') {
            const failure = event.params as BrowserNetworkFailure | undefined
            if (failure && !failure.canceled && !failure.errorText?.includes('ERR_ABORTED')) {
                networkFailures.push(failure)
            }
        }
    }

    return {
        consoleErrors,
        runtimeExceptions,
        logErrors,
        networkFailures,
    }
}

export function writeBrowserSmokeArtifacts(options: {
    outputDir: string
    targetUrl: string
    finalUrl: string
    title: string
    snapshot: string
    networkRequests: string
    screenshotOutput: string
    consoleErrors: BrowserConsoleEvent[]
    runtimeExceptions: BrowserRuntimeException[]
    logErrors: BrowserLogEntry[]
    networkFailures: BrowserNetworkFailure[]
    controllerTrace?: BrowserControllerTraceEvent[]
    extraSummaryLines?: string[]
}): void {
    writeFileSync(join(options.outputDir, 'snapshot.txt'), `${options.snapshot}\n`)
    writeFileSync(join(options.outputDir, 'network-requests.txt'), `${options.networkRequests}\n`)
    writeFileSync(join(options.outputDir, 'console-errors.json'), JSON.stringify(options.consoleErrors, null, 2))
    writeFileSync(
        join(options.outputDir, 'runtime-exceptions.json'),
        JSON.stringify(options.runtimeExceptions, null, 2)
    )
    writeFileSync(join(options.outputDir, 'log-errors.json'), JSON.stringify(options.logErrors, null, 2))
    writeFileSync(join(options.outputDir, 'network-failures.json'), JSON.stringify(options.networkFailures, null, 2))
    writeFileSync(
        join(options.outputDir, 'controller-trace.json'),
        JSON.stringify(options.controllerTrace ?? [], null, 2)
    )
    writeFileSync(
        join(options.outputDir, 'summary.md'),
        `${formatBrowserSmokeSummary(options)}\n- Screenshot output: ${options.screenshotOutput || 'saved to screenshot dir'}\n`
    )
}

export function formatBrowserSmokeSummary(options: {
    targetUrl: string
    finalUrl: string
    title: string
    outputDir: string
    consoleErrors: BrowserConsoleEvent[]
    runtimeExceptions: BrowserRuntimeException[]
    logErrors: BrowserLogEntry[]
    networkFailures: BrowserNetworkFailure[]
    controllerTrace?: BrowserControllerTraceEvent[]
    extraSummaryLines?: string[]
}): string {
    const controllerConflicts = (options.controllerTrace ?? []).filter((event) => event.type === 'conflict').length
    return [
        '# Browser Smoke Summary',
        '',
        `- Target: ${options.targetUrl}`,
        `- Final URL: ${options.finalUrl}`,
        `- Title: ${options.title}`,
        `- Artifact dir: ${options.outputDir}`,
        `- Console errors: ${options.consoleErrors.length}`,
        `- Runtime exceptions: ${options.runtimeExceptions.length}`,
        `- Log errors: ${options.logErrors.length}`,
        `- Network failures: ${options.networkFailures.length}`,
        `- Controller conflicts: ${controllerConflicts}`,
        ...(options.extraSummaryLines ?? []),
        '',
        '## Failure rule',
        '',
        '- console error => fail',
        '- runtime exception => fail',
        '- log error => fail',
        '- network failure except ERR_ABORTED/canceled => fail',
        '',
    ].join('\n')
}
