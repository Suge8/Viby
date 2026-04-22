import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type BrowserContext, type Page } from 'playwright-core'
import {
    COMPOSER_CONTROLS_BUTTON_SELECTOR,
    COMPOSER_CONTROLS_PANEL_SELECTOR,
    SESSION_LIST_ITEM_SELECTOR,
} from '../../web/src/lib/sessionUiContracts'
import {
    createFakeCliRuntime,
    DEFAULT_SESSION_FILE_PATH,
    type FakeCliRuntime,
    seedRuntimeAndSessions,
} from './appLikeRouteBrowserFixtureSupport'
import {
    type IsolatedBrowserApp,
    launchObservedMobileBrowser,
    startIsolatedBrowserApp,
    stopProcess,
} from './browserIsolatedAppSupport'
import type {
    BrowserConsoleEvent,
    BrowserControllerTraceEvent,
    BrowserLogEntry,
    BrowserNetworkFailure,
    BrowserRuntimeException,
} from './browserSmokeSupport'
import {
    isExpectedClaudePanel,
    openSwitchAgentTargets,
    type PanelCapabilityCheck,
    readPanelCapabilityCheck,
    waitForChatReady,
    waitForComposerControlsReady,
    waitForListReady,
} from './composerControlsBrowserSmokeSupport'
import { sanitizeArtifactSegment } from './support'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const smokeLabel = sanitizeArtifactSegment(
    process.env.VIBY_COMPOSER_CONTROLS_BROWSER_SMOKE_LABEL || 'composer-controls'
)
const timestamp = new Date().toISOString().replaceAll(':', '-')
const outputDir = resolve(
    repoRoot,
    process.env.VIBY_COMPOSER_CONTROLS_BROWSER_SMOKE_OUT_DIR || `web/.artifacts/harness/${timestamp}-${smokeLabel}`
)
const HUB_READY_TIMEOUT_MS = 60_000
const WEB_READY_TIMEOUT_MS = 60_000
const ROUTE_SETTLE_TIMEOUT_MS = 12_000
const CLI_API_TOKEN = process.env.VIBY_COMPOSER_CONTROLS_BROWSER_SMOKE_CLI_API_TOKEN || `viby-controls-${timestamp}`
const SESSION_NAME = 'Composer Controls Smoke'
const RUNTIME_ID = 'composer-controls-smoke-runtime'
const LOGIN_INPUT_SELECTOR = 'input[name="accessToken"]'
const LOGIN_SUBMIT_SELECTOR = 'button[type="submit"]'

async function main(): Promise<void> {
    mkdirSync(outputDir, { recursive: true })
    let app: IsolatedBrowserApp | null = null
    let context: BrowserContext | null = null
    let page: Page | null = null
    let fakeCliRuntime: FakeCliRuntime | null = null

    const consoleErrors: BrowserConsoleEvent[] = []
    const runtimeExceptions: BrowserRuntimeException[] = []
    const logErrors: BrowserLogEntry[] = []
    const networkFailures: BrowserNetworkFailure[] = []
    const networkRequests: string[] = []

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
            alphaSessionName: SESSION_NAME,
            betaSessionName: `${SESSION_NAME} Beta`,
            cliApiToken: CLI_API_TOKEN,
            driver: 'claude',
            hubUrl: app.hubUrl,
            outputDir,
            runtimeId: RUNTIME_ID,
            sessionFilePath: DEFAULT_SESSION_FILE_PATH,
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

        console.log('[composer-controls-smoke] login')
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: ROUTE_SETTLE_TIMEOUT_MS })
        await page.locator(LOGIN_INPUT_SELECTOR).fill(CLI_API_TOKEN)
        await page.locator(LOGIN_SUBMIT_SELECTOR).click()
        await waitForListReady(page, ROUTE_SETTLE_TIMEOUT_MS)

        console.log('[composer-controls-smoke] chat')
        await page.locator(SESSION_LIST_ITEM_SELECTOR).filter({ hasText: SESSION_NAME }).first().click()
        await waitForChatReady(page, seededSessions.alphaSessionId, ROUTE_SETTLE_TIMEOUT_MS)

        console.log('[composer-controls-smoke] open controls')
        await page.locator(COMPOSER_CONTROLS_BUTTON_SELECTOR).click()
        await waitForComposerControlsReady(page, ROUTE_SETTLE_TIMEOUT_MS)
        await openSwitchAgentTargets(page, ROUTE_SETTLE_TIMEOUT_MS, 'codex')

        const capabilityCheck = await readPanelCapabilityCheck(page)
        const controllerTrace = await page.evaluate(
            () =>
                (window as typeof window & { __VIBY_CONTROLLER_TRACE__?: BrowserControllerTraceEvent[] })
                    .__VIBY_CONTROLLER_TRACE__ ?? []
        )
        const controllerConflicts = controllerTrace.filter((event) => event.type === 'conflict').length
        const snapshot = await page.locator('body').innerText()
        const panel = page.locator(COMPOSER_CONTROLS_PANEL_SELECTOR).first()

        console.log('[composer-controls-smoke] write artifacts')
        await panel.screenshot({ path: join(outputDir, 'composer-controls-panel.png') })
        writeSmokeArtifacts({
            outputDir,
            targetUrl,
            finalUrl: page.url(),
            capabilityCheck,
            snapshot,
            consoleErrors,
            runtimeExceptions,
            logErrors,
            networkFailures,
            networkRequests,
            controllerTrace,
            controllerConflicts,
        })

        if (!isExpectedClaudePanel(capabilityCheck)) {
            throw new Error('Composer controls smoke found an unexpected Claude control surface matrix')
        }
        if (consoleErrors.length + runtimeExceptions.length + logErrors.length + networkFailures.length > 0) {
            throw new Error('Composer controls smoke recorded browser/runtime failures')
        }
        if (controllerConflicts > 0) {
            throw new Error(`Composer controls smoke recorded ${controllerConflicts} controller conflict(s)`)
        }

        console.log(`[harness] composer controls browser smoke passed. Artifacts: ${outputDir}`)
    } catch (error) {
        writeFileSync(
            join(outputDir, 'failure.txt'),
            `${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}\n`
        )
        throw error
    } finally {
        if (context) {
            await context.close().catch(() => {})
        }
        fakeCliRuntime?.disconnect()
        await stopProcess(app?.webProcess ?? null)
        await stopProcess(app?.hubProcess ?? null)
    }
}

function writeSmokeArtifacts(options: {
    outputDir: string
    targetUrl: string
    finalUrl: string
    capabilityCheck: PanelCapabilityCheck
    snapshot: string
    consoleErrors: BrowserConsoleEvent[]
    runtimeExceptions: BrowserRuntimeException[]
    logErrors: BrowserLogEntry[]
    networkFailures: BrowserNetworkFailure[]
    networkRequests: string[]
    controllerTrace: BrowserControllerTraceEvent[]
    controllerConflicts: number
}): void {
    writeFileSync(join(options.outputDir, 'snapshot.txt'), `${options.snapshot}\n`)
    writeFileSync(join(options.outputDir, 'network-requests.txt'), `${options.networkRequests.join('\n')}\n`)
    writeFileSync(join(options.outputDir, 'console-errors.json'), JSON.stringify(options.consoleErrors, null, 2))
    writeFileSync(
        join(options.outputDir, 'runtime-exceptions.json'),
        JSON.stringify(options.runtimeExceptions, null, 2)
    )
    writeFileSync(join(options.outputDir, 'log-errors.json'), JSON.stringify(options.logErrors, null, 2))
    writeFileSync(join(options.outputDir, 'network-failures.json'), JSON.stringify(options.networkFailures, null, 2))
    writeFileSync(join(options.outputDir, 'controller-trace.json'), JSON.stringify(options.controllerTrace, null, 2))
    writeFileSync(
        join(options.outputDir, 'composer-controls-check.json'),
        `${JSON.stringify(options.capabilityCheck, null, 2)}\n`
    )
    writeFileSync(
        join(options.outputDir, 'summary.md'),
        [
            '# Composer Controls Smoke',
            '',
            `- Target URL: ${options.targetUrl}`,
            `- Final URL: ${options.finalUrl}`,
            `- Console errors: ${options.consoleErrors.length}`,
            `- Runtime exceptions: ${options.runtimeExceptions.length}`,
            `- Log errors: ${options.logErrors.length}`,
            `- Network failures: ${options.networkFailures.length}`,
            `- Controller conflicts: ${options.controllerConflicts}`,
            `- Switch agent visible: ${String(options.capabilityCheck.switchAgentVisible)}`,
            `- Current Claude visible: ${String(options.capabilityCheck.currentAgentVisible)}`,
            `- Model section: ${String(options.capabilityCheck.sections.model)}`,
            `- Reasoning section: ${String(options.capabilityCheck.sections.reasoning)}`,
            `- Collaboration section: ${String(options.capabilityCheck.sections.collaboration)}`,
            `- Permission section: ${String(options.capabilityCheck.sections.permission)}`,
            `- Targets: ${JSON.stringify(options.capabilityCheck.switchTargets)}`,
        ].join('\n') + '\n'
    )
}

await main()
