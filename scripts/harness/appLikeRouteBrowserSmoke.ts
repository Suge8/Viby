import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type BrowserContext, type Page } from 'playwright-core'
import {
    createFakeCliRuntime,
    DEFAULT_SESSION_FILE_PATH,
    type FakeCliRuntime,
    seedRuntimeAndSessions,
} from './appLikeRouteBrowserFixtureSupport'
import { LOGIN_INPUT_SELECTOR, runAppLikeRouteFlows } from './appLikeRouteBrowserFlowSupport'
import { type FlowArtifact, validateArtifacts, writeArtifacts } from './appLikeRouteBrowserProbeSupport'
import {
    type IsolatedBrowserApp,
    launchObservedMobileBrowser,
    startIsolatedBrowserApp,
    stopProcess,
} from './browserIsolatedAppSupport'
import type {
    BrowserConsoleEvent,
    BrowserLogEntry,
    BrowserNetworkFailure,
    BrowserRuntimeException,
} from './browserSmokeSupport'
import { sanitizeArtifactSegment } from './support'
import { buildRichTranscriptSeedMessages } from './transcriptSeedSupport'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const smokeLabel = sanitizeArtifactSegment(process.env.VIBY_APP_LIKE_BROWSER_SMOKE_LABEL || 'app-like-core-routes')
const timestamp = new Date().toISOString().replaceAll(':', '-')
const outputDir = resolve(
    repoRoot,
    process.env.VIBY_APP_LIKE_BROWSER_SMOKE_OUT_DIR || `web/.artifacts/harness/${timestamp}-${smokeLabel}`
)
const HUB_READY_TIMEOUT_MS = 60_000
const WEB_READY_TIMEOUT_MS = 60_000
const ROUTE_SETTLE_TIMEOUT_MS = 12_000
const PROBE_DURATION_MS = 1_200
const CLI_API_TOKEN = process.env.VIBY_APP_LIKE_BROWSER_SMOKE_CLI_API_TOKEN || `viby-app-like-${timestamp}`
const SESSION_ALPHA_NAME = 'Route Smoke Alpha'
const SESSION_BETA_NAME = 'Route Smoke Beta'
const RUNTIME_ID = 'smoke-runtime'
const APP_LIKE_PREFILL_TURN_COUNT = 12

async function main(): Promise<void> {
    mkdirSync(outputDir, { recursive: true })
    let app: IsolatedBrowserApp | null = null
    let context: BrowserContext | null = null
    let page: Page | null = null
    let fakeCliRuntime: FakeCliRuntime | null = null
    let smokeError: unknown = null

    const consoleErrors: BrowserConsoleEvent[] = []
    const runtimeExceptions: BrowserRuntimeException[] = []
    const logErrors: BrowserLogEntry[] = []
    const networkFailures: BrowserNetworkFailure[] = []
    const networkRequests: string[] = []
    const flowArtifacts: FlowArtifact[] = []

    try {
        app = await startIsolatedBrowserApp({
            cliApiToken: CLI_API_TOKEN,
            hubReadyTimeoutMs: HUB_READY_TIMEOUT_MS,
            outputDir,
            repoRoot,
            webReadyTimeoutMs: WEB_READY_TIMEOUT_MS,
        })
        const targetUrl = `${app.webUrl}/sessions?hub=${encodeURIComponent(app.hubUrl)}`

        const seededSessions = await seedRuntimeAndSessions({
            alphaSessionName: SESSION_ALPHA_NAME,
            alphaPrefillStoredMessages: buildRichTranscriptSeedMessages(APP_LIKE_PREFILL_TURN_COUNT),
            betaSessionName: SESSION_BETA_NAME,
            cliApiToken: CLI_API_TOKEN,
            hubUrl: app.hubUrl,
            outputDir,
            runtimeId: RUNTIME_ID,
            vibyHomeDir: app.vibyHomeDir,
        })
        fakeCliRuntime = await createFakeCliRuntime({
            cliApiToken: CLI_API_TOKEN,
            hubUrl: app.hubUrl,
            repoRoot,
            routeSettleTimeoutMs: ROUTE_SETTLE_TIMEOUT_MS,
            sessionId: seededSessions.alphaSessionId,
            workspaceRoot: seededSessions.alphaWorkspace.rootPath,
        })

        ;({ context, page } = await launchObservedMobileBrowser({
            browserProfileDir: app.browserProfileDir,
            buckets: {
                consoleErrors,
                runtimeExceptions,
                logErrors,
                networkFailures,
                networkRequests,
            },
            outputDir,
        }))
        await context.tracing.start({ screenshots: true, snapshots: true })

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: ROUTE_SETTLE_TIMEOUT_MS })
        await page.locator(LOGIN_INPUT_SELECTOR).waitFor({ timeout: ROUTE_SETTLE_TIMEOUT_MS })

        flowArtifacts.push(
            ...(await runAppLikeRouteFlows({
                cliApiToken: CLI_API_TOKEN,
                outputDir,
                page,
                probeDurationMs: PROBE_DURATION_MS,
                routeSettleTimeoutMs: ROUTE_SETTLE_TIMEOUT_MS,
                sessionFilePath: DEFAULT_SESSION_FILE_PATH,
                sessionId: seededSessions.alphaSessionId,
                sessionLabel: SESSION_ALPHA_NAME,
            }))
        )

        await writeArtifacts({
            outputDir,
            targetUrl,
            page,
            consoleErrors,
            runtimeExceptions,
            logErrors,
            networkFailures,
            networkRequests,
            flowArtifacts,
        })
        validateArtifacts({ consoleErrors, runtimeExceptions, logErrors, networkFailures, flowArtifacts })
        console.log(`[harness] app-like route browser smoke passed. Artifacts: ${outputDir}`)
    } catch (error) {
        smokeError = error
        if (page) {
            try {
                await writeArtifacts({
                    outputDir,
                    targetUrl,
                    page,
                    consoleErrors,
                    runtimeExceptions,
                    logErrors,
                    networkFailures,
                    networkRequests,
                    flowArtifacts,
                    failure: error instanceof Error ? error.message : String(error),
                })
            } catch {
                // Best-effort artifact capture only.
            }
        }
        throw error
    } finally {
        if (smokeError) {
            writeFileSync(
                join(outputDir, 'failure.txt'),
                `${smokeError instanceof Error ? `${smokeError.message}\n${smokeError.stack ?? ''}` : String(smokeError)}\n`
            )
        }
        if (context) {
            await context.tracing.stop({ path: join(outputDir, 'trace.zip') }).catch(() => {})
            await context.close().catch(() => {})
        }
        fakeCliRuntime?.disconnect()
        await stopProcess(app?.webProcess ?? null)
        await stopProcess(app?.hubProcess ?? null)
    }
}

await main()
