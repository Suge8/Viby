import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    SESSION_CHAT_COMPOSER_STAGE_SELECTOR,
    SESSION_CHAT_PAGE_SELECTOR,
    SESSION_CHAT_VIEWPORT_SELECTOR,
    SESSION_LIST_ITEM_SELECTOR,
    THREAD_BOTTOM_CONTROL_SELECTOR,
    THREAD_HISTORY_CONTROL_SELECTOR,
} from '../../web/src/lib/sessionUiContracts'
import { createFakeCliRuntime, type FakeCliRuntime, seedRuntimeAndSessions } from './appLikeRouteBrowserFixtureSupport'
import { LOGIN_INPUT_SELECTOR } from './appLikeRouteBrowserFlowSupport'
import {
    type BrowserObservabilityBuckets,
    type IsolatedBrowserApp,
    launchObservedDesktopBrowser,
    startIsolatedBrowserApp,
    stopProcess,
} from './browserIsolatedAppSupport'
import { sanitizeArtifactSegment } from './support'
import { buildRichTranscriptSeedMessages } from './transcriptSeedSupport'

type DesktopChatGeometry = {
    bottomButtonCenterX: number | null
    bottomButtonGap: number | null
    bottomButtonVisible: boolean
    composerTop: number
    desktopGap: number
    historyButtonCenterX: number
    lastRowBottom: number
    restingGap: number
    stageCenterX: number
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const smokeLabel = sanitizeArtifactSegment(process.env.VIBY_DESKTOP_CHAT_PROBE_LABEL || 'desktop-chat-controls')
const timestamp = new Date().toISOString().replaceAll(':', '-')
const outputDir = resolve(
    repoRoot,
    process.env.VIBY_DESKTOP_CHAT_PROBE_OUT_DIR || `web/.artifacts/harness/${timestamp}-${smokeLabel}`
)
const HUB_READY_TIMEOUT_MS = 60_000
const WEB_READY_TIMEOUT_MS = 60_000
const ROUTE_SETTLE_TIMEOUT_MS = 12_000
const CLI_API_TOKEN = process.env.VIBY_DESKTOP_CHAT_PROBE_CLI_API_TOKEN || `viby-desktop-chat-${timestamp}`
const SESSION_NAME = 'Desktop Chat Geometry'
const RUNTIME_ID = 'desktop-chat-geometry-runtime'
const PREFILL_TURN_COUNT = 12
const CENTER_TOLERANCE_PX = 2
const GAP_TOLERANCE_PX = 2
const LEAVE_BOTTOM_SCROLL_DELTA_PX = -280
const DESKTOP_RESTING_GAP_PX = 6

async function main(): Promise<void> {
    mkdirSync(outputDir, { recursive: true })
    let app: IsolatedBrowserApp | null = null
    let fakeCliRuntime: FakeCliRuntime | null = null
    const buckets: BrowserObservabilityBuckets = {
        consoleErrors: [],
        logErrors: [],
        networkFailures: [],
        networkRequests: [],
        runtimeExceptions: [],
    }

    try {
        app = await startIsolatedBrowserApp({
            cliApiToken: CLI_API_TOKEN,
            hubReadyTimeoutMs: HUB_READY_TIMEOUT_MS,
            outputDir,
            repoRoot,
            webReadyTimeoutMs: WEB_READY_TIMEOUT_MS,
        })
        const seeded = await seedRuntimeAndSessions({
            alphaSessionName: SESSION_NAME,
            alphaPrefillStoredMessages: buildRichTranscriptSeedMessages(PREFILL_TURN_COUNT),
            betaSessionName: 'Desktop Chat Geometry Beta',
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
            sessionId: seeded.alphaSessionId,
            workspaceRoot: seeded.alphaWorkspace.rootPath,
        })

        const { context, page } = await launchObservedDesktopBrowser({
            browserProfileDir: app.browserProfileDir,
            buckets,
            outputDir,
        })

        try {
            const targetUrl = `${app.webUrl}/sessions?hub=${encodeURIComponent(app.hubUrl)}`
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: ROUTE_SETTLE_TIMEOUT_MS })
            await page.locator(LOGIN_INPUT_SELECTOR).fill(CLI_API_TOKEN)
            await page.locator('button[type="submit"]').click()
            await page.locator(SESSION_LIST_ITEM_SELECTOR).filter({ hasText: SESSION_NAME }).first().click()
            await page.locator(SESSION_CHAT_PAGE_SELECTOR).first().waitFor({ timeout: ROUTE_SETTLE_TIMEOUT_MS })
            await page.waitForTimeout(800)
            await waitForDesktopRestingGeometry(page, ROUTE_SETTLE_TIMEOUT_MS)

            const restingGeometry = await captureDesktopChatGeometry(page)
            await page.screenshot({ path: join(outputDir, 'desktop-chat-controls-resting.png') })

            await page
                .locator(SESSION_CHAT_VIEWPORT_SELECTOR)
                .first()
                .evaluate((node, deltaPx) => {
                    if (!(node instanceof HTMLDivElement)) {
                        throw new Error('Desktop chat viewport missing for leave-bottom scroll')
                    }

                    node.dispatchEvent(
                        new WheelEvent('wheel', {
                            deltaY: deltaPx,
                            bubbles: true,
                            cancelable: true,
                        })
                    )
                    node.scrollBy(0, deltaPx)
                }, LEAVE_BOTTOM_SCROLL_DELTA_PX)

            await page.waitForFunction(
                (selector) => {
                    const button = document.querySelector(selector)
                    return (
                        button instanceof HTMLButtonElement &&
                        !button.disabled &&
                        button.getAttribute('aria-hidden') !== 'true'
                    )
                },
                THREAD_BOTTOM_CONTROL_SELECTOR,
                { timeout: ROUTE_SETTLE_TIMEOUT_MS }
            )

            const controlsGeometry = await captureDesktopChatGeometry(page)
            await page.screenshot({ path: join(outputDir, 'desktop-chat-controls-overlay.png') })

            if (Math.abs(restingGeometry.restingGap - DESKTOP_RESTING_GAP_PX) > GAP_TOLERANCE_PX) {
                throw new Error(
                    `Desktop resting gap drifted away from ${DESKTOP_RESTING_GAP_PX}px (gap=${restingGeometry.restingGap})`
                )
            }
            if (Math.abs(controlsGeometry.historyButtonCenterX - controlsGeometry.stageCenterX) > CENTER_TOLERANCE_PX) {
                throw new Error(
                    `Desktop history control drifted off stage center (history=${controlsGeometry.historyButtonCenterX}, stage=${controlsGeometry.stageCenterX})`
                )
            }
            if (
                controlsGeometry.bottomButtonCenterX === null ||
                Math.abs(controlsGeometry.bottomButtonCenterX - controlsGeometry.stageCenterX) > CENTER_TOLERANCE_PX
            ) {
                throw new Error(
                    `Desktop bottom control drifted off stage center (bottom=${controlsGeometry.bottomButtonCenterX}, stage=${controlsGeometry.stageCenterX})`
                )
            }
            if (
                controlsGeometry.bottomButtonGap === null ||
                Math.abs(controlsGeometry.bottomButtonGap - controlsGeometry.desktopGap) > GAP_TOLERANCE_PX
            ) {
                throw new Error(
                    `Desktop bottom control gap drifted away from the composer stage (gap=${controlsGeometry.bottomButtonGap}, expected=${controlsGeometry.desktopGap})`
                )
            }

            writeFileSync(
                join(outputDir, 'desktop-chat-controls.json'),
                `${JSON.stringify({ controls: controlsGeometry, resting: restingGeometry }, null, 2)}\n`
            )
            console.log(`[harness] desktop chat control probe passed. Artifacts: ${outputDir}`)
        } finally {
            await context.close().catch(() => {})
        }
    } finally {
        fakeCliRuntime?.disconnect()
        await stopProcess(app?.webProcess ?? null)
        await stopProcess(app?.hubProcess ?? null)
    }
}

async function captureDesktopChatGeometry(page: import('playwright-core').Page): Promise<DesktopChatGeometry> {
    return await page.evaluate(
        ({ bottomSelector, composerSelector, historySelector, viewportSelector }) => {
            function readLengthPx(scope: HTMLElement, rawValue: string): number {
                const value = rawValue.trim()
                if (value.length === 0) {
                    return 0
                }

                const probe = document.createElement('div')
                probe.style.position = 'absolute'
                probe.style.visibility = 'hidden'
                probe.style.pointerEvents = 'none'
                probe.style.marginTop = value
                scope.appendChild(probe)
                const px = Math.round(Number.parseFloat(getComputedStyle(probe).marginTop) || 0)
                probe.remove()
                return px
            }

            function getLastVisibleRow(viewport: HTMLDivElement): HTMLElement | null {
                const rows = [...viewport.querySelectorAll<HTMLElement>('.ds-transcript-row[data-conversation-id]')]
                const viewportRect = viewport.getBoundingClientRect()
                const viewportTop = viewportRect.top + 1
                const viewportBottom = viewportRect.bottom - 1
                const visibleRows = rows.filter((row) => {
                    const rect = row.getBoundingClientRect()
                    return rect.bottom > viewportTop && rect.top < viewportBottom
                })
                return visibleRows.at(-1) ?? null
            }

            const composerStage = document.querySelector(composerSelector)
            const historyButton = document.querySelector(historySelector)
            const bottomButton = document.querySelector(bottomSelector)
            const viewport = document.querySelector(viewportSelector)
            const layout = composerStage?.closest('.session-chat-layout')
            if (
                !(composerStage instanceof HTMLElement) ||
                !(historyButton instanceof HTMLButtonElement) ||
                !(viewport instanceof HTMLDivElement)
            ) {
                throw new Error('Desktop chat geometry surface missing')
            }

            const stageRect = composerStage.getBoundingClientRect()
            const historyRect = historyButton.getBoundingClientRect()
            const bottomRect = bottomButton instanceof HTMLButtonElement ? bottomButton.getBoundingClientRect() : null
            const lastVisibleRow = getLastVisibleRow(viewport)

            return {
                bottomButtonCenterX: bottomRect ? Math.round(bottomRect.left + bottomRect.width / 2) : null,
                bottomButtonGap: bottomRect ? Math.round(stageRect.top - bottomRect.bottom) : null,
                bottomButtonVisible:
                    bottomButton instanceof HTMLButtonElement &&
                    !bottomButton.disabled &&
                    bottomButton.getAttribute('aria-hidden') !== 'true',
                composerTop: Math.round(stageRect.top),
                desktopGap: readLengthPx(
                    layout instanceof HTMLElement ? layout : document.body,
                    getComputedStyle(layout ?? document.documentElement).getPropertyValue(
                        '--chat-desktop-bottom-control-gap'
                    )
                ),
                historyButtonCenterX: Math.round(historyRect.left + historyRect.width / 2),
                lastRowBottom: lastVisibleRow ? Math.round(lastVisibleRow.getBoundingClientRect().bottom) : 0,
                restingGap: Math.round(
                    stageRect.top - (lastVisibleRow?.getBoundingClientRect().bottom ?? stageRect.top)
                ),
                stageCenterX: Math.round(stageRect.left + stageRect.width / 2),
            } satisfies DesktopChatGeometry
        },
        {
            bottomSelector: THREAD_BOTTOM_CONTROL_SELECTOR,
            composerSelector: SESSION_CHAT_COMPOSER_STAGE_SELECTOR,
            historySelector: THREAD_HISTORY_CONTROL_SELECTOR,
            viewportSelector: SESSION_CHAT_VIEWPORT_SELECTOR,
        }
    )
}

async function waitForDesktopRestingGeometry(page: Page, timeoutMs: number): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        const geometry = await captureDesktopChatGeometry(page)
        if (
            Math.abs(geometry.restingGap - DESKTOP_RESTING_GAP_PX) <= GAP_TOLERANCE_PX &&
            !geometry.bottomButtonVisible
        ) {
            return
        }

        await page.waitForTimeout(100)
    }

    throw new Error('Timed out waiting for the desktop transcript to settle at the defined resting gap')
}

await main()
