import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    type BrowserSmokeScreenshotResult,
    captureBrowserSmokeScreenshot,
    closeAgentBrowserDaemon,
    resolveBrowserSmokeProfileDir,
    runAgentBrowserCommand,
} from './browserSmokeRuntime'
import {
    attachToPageTarget,
    type BrowserControllerTraceEvent,
    CdpClient,
    collectBrowserFailures,
    sleep,
    writeBrowserSmokeArtifacts,
} from './browserSmokeSupport'
import { sanitizeArtifactSegment } from './support'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const smokeUrl = process.env.VIBY_BROWSER_SMOKE_URL || 'http://127.0.0.1:5173'
const smokeLabel = sanitizeArtifactSegment(process.env.VIBY_BROWSER_SMOKE_LABEL || smokeUrl)
const timestamp = new Date().toISOString().replaceAll(':', '-')
const outputDir = resolve(
    repoRoot,
    process.env.VIBY_BROWSER_SMOKE_OUT_DIR || `web/.artifacts/harness/${timestamp}-${smokeLabel}`
)
const extraWaitMs = Number.parseInt(process.env.VIBY_BROWSER_SMOKE_WAIT_MS || '1500', 10)
const browserProfile = resolveBrowserSmokeProfileDir(process.env.VIBY_BROWSER_PROFILE_DIR)
const AGENT_BROWSER_CDP_READY_ATTEMPTS = 10
const AGENT_BROWSER_CDP_READY_DELAY_MS = 250
type BrowserPageState = {
    snapshot: string
    networkRequests: string
    title: string
    finalUrl: string
}

function closeExistingBrowserDaemon(): void {
    try {
        closeAgentBrowserDaemon(repoRoot)
    } catch {
        // No daemon is also a valid start state for isolated smoke runs.
    }
}

async function openBrowserAndResolveCdpUrl(): Promise<string> {
    closeExistingBrowserDaemon()
    runAgentBrowserCommand(repoRoot, ['open', 'about:blank'], { profileDir: browserProfile.profileDir })

    let lastError: unknown = null
    for (let attempt = 0; attempt < AGENT_BROWSER_CDP_READY_ATTEMPTS; attempt += 1) {
        try {
            return runAgentBrowserCommand(repoRoot, ['get', 'cdp-url'], { profileDir: browserProfile.profileDir })
                .stdout
        } catch (error) {
            lastError = error
            if (attempt < AGENT_BROWSER_CDP_READY_ATTEMPTS - 1) {
                await sleep(AGENT_BROWSER_CDP_READY_DELAY_MS)
                continue
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to resolve agent-browser CDP URL')
}

async function main(): Promise<void> {
    mkdirSync(outputDir, { recursive: true })

    let client: CdpClient | null = null
    let sessionId: string | null = null
    let harStarted = false
    let artifactsWritten = false
    let pageState: BrowserPageState | null = null
    let smokeError: unknown = null

    try {
        const cdpUrl = await openBrowserAndResolveCdpUrl()
        client = await CdpClient.connect(cdpUrl)
        sessionId = await attachToPageTarget(client)

        await client.send('Runtime.enable', {}, sessionId)
        await client.send('Log.enable', {}, sessionId)
        await client.send('Network.enable', {}, sessionId)
        await client.send('Page.enable', {}, sessionId)

        runAgentBrowserCommand(repoRoot, ['network', 'har', 'start'], { profileDir: browserProfile.profileDir })
        harStarted = true
        runAgentBrowserCommand(repoRoot, ['open', smokeUrl], { profileDir: browserProfile.profileDir })
        runAgentBrowserCommand(repoRoot, ['wait', '--load', 'networkidle'], { profileDir: browserProfile.profileDir })
        await sleep(Number.isFinite(extraWaitMs) && extraWaitMs > 0 ? extraWaitMs : 1500)

        pageState = readBrowserPageState()
        const controllerTrace = await readControllerTrace(client, sessionId)
        const screenshotResult = await captureBrowserSmokeScreenshot({
            outputDir,
            repoRoot,
            profileDir: browserProfile.profileDir,
            pageUrl: pageState.finalUrl,
        })

        if (harStarted) {
            stopHarCapture()
            harStarted = false
        }

        const failureCount = writeSmokeArtifacts({
            client,
            sessionId,
            pageState,
            controllerTrace,
            screenshotResult,
            extraSummaryLines: createSummaryLines(controllerTrace, screenshotResult),
        })
        artifactsWritten = true
        if (failureCount > 0) {
            throw new Error(`browser smoke recorded ${failureCount} issue(s)`)
        }
    } catch (error) {
        smokeError = error
        if (!artifactsWritten && client && sessionId) {
            try {
                const resolvedPageState = pageState ?? readBrowserPageState()
                const controllerTrace = await readControllerTrace(client, sessionId)
                const screenshotResult = await captureBrowserSmokeScreenshot({
                    outputDir,
                    repoRoot,
                    profileDir: browserProfile.profileDir,
                    pageUrl: resolvedPageState.finalUrl,
                }).catch(
                    (screenshotError) =>
                        ({
                            output: 'not captured',
                            owner: 'playwright',
                            mode: 'viewport',
                            fallbackReason:
                                screenshotError instanceof Error
                                    ? screenshotError.message.split('\n')[0]
                                    : String(screenshotError),
                        }) satisfies BrowserSmokeScreenshotResult
                )

                if (harStarted) {
                    stopHarCapture()
                    harStarted = false
                }

                writeSmokeArtifacts({
                    client,
                    sessionId,
                    pageState: resolvedPageState,
                    controllerTrace,
                    screenshotResult,
                    extraSummaryLines: [
                        `- Failure: ${error instanceof Error ? error.message : String(error)}`,
                        ...createSummaryLines(controllerTrace, screenshotResult),
                    ],
                })
                artifactsWritten = true
            } catch {
                // Failure artifact capture is best-effort.
            }
        }
        throw error
    } finally {
        if (harStarted) {
            try {
                runAgentBrowserCommand(repoRoot, ['network', 'har', 'stop', join(outputDir, 'network.har')], {
                    profileDir: browserProfile.profileDir,
                })
            } catch {
                // HAR capture is best-effort during shutdown.
            }
        }

        client?.close()

        try {
            closeAgentBrowserDaemon(repoRoot)
        } catch {
            // Browser shutdown is best-effort.
        }

        if (smokeError) {
            writeFileSync(
                join(outputDir, 'failure.txt'),
                `${smokeError instanceof Error ? `${smokeError.message}\n${smokeError.stack ?? ''}` : String(smokeError)}\n`
            )
            return
        }
    }

    console.log(`[harness] browser smoke passed. Artifacts: ${outputDir}`)
}

async function readControllerTrace(client: CdpClient, sessionId: string): Promise<BrowserControllerTraceEvent[]> {
    const evaluation = (await client.send(
        'Runtime.evaluate',
        {
            expression: 'JSON.stringify(window.__VIBY_CONTROLLER_TRACE__ ?? [])',
            returnByValue: true,
        },
        sessionId
    )) as { result?: { value?: string } }

    const serialized = evaluation.result?.value
    if (typeof serialized !== 'string' || serialized.trim().length === 0) {
        return []
    }

    try {
        const parsed = JSON.parse(serialized) as BrowserControllerTraceEvent[]
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function writeSmokeArtifacts(options: {
    client: CdpClient
    sessionId: string
    pageState: BrowserPageState
    controllerTrace: BrowserControllerTraceEvent[]
    screenshotResult: BrowserSmokeScreenshotResult
    extraSummaryLines: string[]
}): number {
    const { consoleErrors, runtimeExceptions, logErrors, networkFailures } = collectBrowserFailures({
        client: options.client,
        sessionId: options.sessionId,
    })

    writeBrowserSmokeArtifacts({
        outputDir,
        targetUrl: smokeUrl,
        finalUrl: options.pageState.finalUrl,
        title: options.pageState.title,
        snapshot: options.pageState.snapshot,
        networkRequests: options.pageState.networkRequests,
        screenshotOutput: options.screenshotResult.output,
        consoleErrors,
        runtimeExceptions,
        logErrors,
        networkFailures,
        controllerTrace: options.controllerTrace,
        extraSummaryLines: options.extraSummaryLines,
    })

    const controllerConflicts = options.controllerTrace.filter((event) => event.type === 'conflict').length
    return (
        consoleErrors.length +
        runtimeExceptions.length +
        logErrors.length +
        networkFailures.length +
        controllerConflicts
    )
}

function createSummaryLines(
    controllerTrace: BrowserControllerTraceEvent[],
    screenshotResult: BrowserSmokeScreenshotResult
): string[] {
    return [
        `- Browser profile: ${browserProfile.profileDir}`,
        `- Browser profile mode: ${browserProfile.managed ? 'managed-temp' : 'explicit'}`,
        `- Screenshot owner: ${screenshotResult.owner}`,
        `- Screenshot mode: ${screenshotResult.mode}`,
        ...(screenshotResult.fallbackReason ? [`- Screenshot fallback: ${screenshotResult.fallbackReason}`] : []),
        `- Controller trace events: ${controllerTrace.length}`,
    ]
}

function readBrowserPageState(): BrowserPageState {
    return {
        snapshot: safeAgentBrowserOutput(['snapshot', '-i'], '(snapshot unavailable)'),
        networkRequests: safeAgentBrowserOutput(['network', 'requests'], '(network requests unavailable)'),
        title: safeAgentBrowserOutput(['get', 'title'], '(title unavailable)'),
        finalUrl: safeAgentBrowserOutput(['get', 'url'], smokeUrl),
    }
}

function safeAgentBrowserOutput(args: string[], fallback: string): string {
    try {
        return runAgentBrowserCommand(repoRoot, args, { profileDir: browserProfile.profileDir }).stdout || fallback
    } catch {
        return fallback
    }
}

function stopHarCapture(): void {
    runAgentBrowserCommand(repoRoot, ['network', 'har', 'stop', join(outputDir, 'network.har')], {
        profileDir: browserProfile.profileDir,
    })
}

await main()
