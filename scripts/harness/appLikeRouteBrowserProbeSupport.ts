import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type CDPSession, type Frame, type Page } from 'playwright-core'
import { SESSION_CHAT_PAGE_SELECTOR, SESSION_ROUTE_PAGE_SURFACE_SELECTOR } from '../../web/src/lib/sessionUiContracts'
import {
    NEW_SESSION_ROUTE,
    SESSIONS_INDEX_ROUTE,
    SETTINGS_ROUTE,
} from '../../web/src/routes/sessions/sessionRoutePaths'
import {
    type AppLikeRouteProbeFrame,
    formatAppLikeEvidenceSummary,
    summarizeAppLikeRouteFlow,
} from './appLikeRouteEvidenceSupport'
import type {
    BrowserConsoleEvent,
    BrowserControllerTraceEvent,
    BrowserLogEntry,
    BrowserNetworkFailure,
    BrowserRuntimeException,
} from './browserSmokeSupport'

export type FlowArtifact = {
    id: string
    timelinePath: string
    screenshotPath: string
    summary: ReturnType<typeof summarizeAppLikeRouteFlow>
    allowLoginVisible?: boolean
}

export function wireBrowserObservability(
    cdp: CDPSession,
    buckets: {
        consoleErrors: BrowserConsoleEvent[]
        logErrors: BrowserLogEntry[]
        networkFailures: BrowserNetworkFailure[]
        networkRequests: string[]
        runtimeExceptions: BrowserRuntimeException[]
    }
): void {
    void cdp.send('Runtime.enable')
    void cdp.send('Log.enable')
    void cdp.send('Network.enable')

    cdp.on('Runtime.consoleAPICalled', (payload) => {
        if (payload.type === 'error' || payload.type === 'assert') {
            buckets.consoleErrors.push(payload)
        }
    })
    cdp.on('Runtime.exceptionThrown', (payload) => {
        buckets.runtimeExceptions.push({ text: payload.exceptionDetails?.text })
    })
    cdp.on('Log.entryAdded', (payload) => {
        if (payload.entry?.level === 'error') {
            buckets.logErrors.push(payload.entry)
        }
    })
    cdp.on('Network.loadingFailed', (payload) => {
        if (!payload.canceled && !payload.errorText?.includes('ERR_ABORTED')) {
            buckets.networkFailures.push(payload)
        }
    })
    cdp.on('Network.requestWillBeSent', (payload) => {
        const request = payload.request
        if (!request?.url || !request?.method) {
            return
        }
        buckets.networkRequests.push(`${request.method} ${request.url}`)
    })
}

export async function captureFlow(options: {
    action: () => Promise<void>
    allowLoginVisible?: boolean
    id: string
    outputDir: string
    page: Page
    probeDurationMs: number
    ready: () => Promise<void>
}): Promise<FlowArtifact> {
    const reinstateProbe = (): void => {
        void installRouteProbe(options.page, options.probeDurationMs).catch(() => {})
    }
    const handleFrameNavigated = (frame: Frame): void => {
        if (frame !== options.page.mainFrame()) {
            return
        }

        reinstateProbe()
    }

    options.page.on('framenavigated', handleFrameNavigated)

    let frames: AppLikeRouteProbeFrame[] = []

    try {
        await installRouteProbe(options.page, options.probeDurationMs)
        await options.action()
        await options.ready()
        await options.page.waitForTimeout(options.probeDurationMs + 120)
        frames =
            (await options.page.evaluate(
                () =>
                    (
                        window as typeof window & {
                            __VIBY_APP_LIKE_ROUTE_PROBE_FRAMES__?: AppLikeRouteProbeFrame[]
                        }
                    ).__VIBY_APP_LIKE_ROUTE_PROBE_FRAMES__ ?? []
            )) ?? []
    } finally {
        options.page.off('framenavigated', handleFrameNavigated)
    }

    const screenshotPath = join(options.outputDir, `${options.id}.png`)
    const timelinePath = join(options.outputDir, `${options.id}.timeline.json`)
    const summary = summarizeAppLikeRouteFlow(frames ?? [])
    await options.page.screenshot({ path: screenshotPath })
    writeFileSync(timelinePath, `${JSON.stringify({ id: options.id, summary, frames }, null, 2)}\n`)

    return {
        id: options.id,
        timelinePath,
        screenshotPath,
        summary,
        allowLoginVisible: options.allowLoginVisible,
    }
}

export async function writeArtifacts(options: {
    consoleErrors: BrowserConsoleEvent[]
    failure?: string
    flowArtifacts: FlowArtifact[]
    logErrors: BrowserLogEntry[]
    networkFailures: BrowserNetworkFailure[]
    networkRequests: string[]
    outputDir: string
    page: Page
    runtimeExceptions: BrowserRuntimeException[]
    targetUrl: string
}): Promise<void> {
    const finalUrl = options.page.url()
    const snapshot = await options.page
        .locator('body')
        .innerText()
        .catch(() => '(snapshot unavailable)')
    const controllerTrace = await options.page.evaluate(
        () =>
            (window as typeof window & { __VIBY_CONTROLLER_TRACE__?: BrowserControllerTraceEvent[] })
                .__VIBY_CONTROLLER_TRACE__ ?? []
    )
    const controllerConflicts = controllerTrace.filter((event) => event.type === 'conflict').length

    writeFileSync(join(options.outputDir, 'snapshot.txt'), `${snapshot}\n`)
    writeFileSync(join(options.outputDir, 'network-requests.txt'), `${options.networkRequests.join('\n')}\n`)
    writeFileSync(join(options.outputDir, 'console-errors.json'), JSON.stringify(options.consoleErrors, null, 2))
    writeFileSync(
        join(options.outputDir, 'runtime-exceptions.json'),
        JSON.stringify(options.runtimeExceptions, null, 2)
    )
    writeFileSync(join(options.outputDir, 'log-errors.json'), JSON.stringify(options.logErrors, null, 2))
    writeFileSync(join(options.outputDir, 'network-failures.json'), JSON.stringify(options.networkFailures, null, 2))
    writeFileSync(join(options.outputDir, 'controller-trace.json'), JSON.stringify(controllerTrace, null, 2))
    writeFileSync(
        join(options.outputDir, 'summary.md'),
        `${formatAppLikeEvidenceSummary({
            targetUrl: options.targetUrl,
            finalUrl,
            outputDir: options.outputDir,
            consoleErrors: options.consoleErrors.length,
            runtimeExceptions: options.runtimeExceptions.length,
            logErrors: options.logErrors.length,
            networkFailures: options.networkFailures.length,
            controllerConflicts,
            flowSummaries: options.flowArtifacts.map((flow) => ({
                id: flow.id,
                summary: flow.summary,
                screenshotPath: flow.screenshotPath,
                allowLoginVisible: flow.allowLoginVisible,
            })),
            extraSummaryLines: options.failure ? [`- Failure: ${options.failure}`] : [],
        })}\n`
    )
}

export function validateArtifacts(options: {
    consoleErrors: BrowserConsoleEvent[]
    flowArtifacts: FlowArtifact[]
    logErrors: BrowserLogEntry[]
    networkFailures: BrowserNetworkFailure[]
    runtimeExceptions: BrowserRuntimeException[]
}): void {
    const browserFailureCount =
        options.consoleErrors.length +
        options.runtimeExceptions.length +
        options.logErrors.length +
        options.networkFailures.length
    const flowFailureCount = options.flowArtifacts.reduce((count, flow) => {
        return (
            count +
            Number(flow.summary.blankFrameCount > 0) +
            Number(flow.summary.multiListPaneFrameCount > 0) +
            Number(flow.summary.multiChatSurfaceFrameCount > 0) +
            Number(flow.summary.heroLoadingFrameCount > 0) +
            Number(!flow.allowLoginVisible && flow.summary.loginVisibleFrameCount > 0) +
            Number(flow.summary.routeSurfaceTransparentFrameCount > 0)
        )
    }, 0)

    if (browserFailureCount + flowFailureCount > 0) {
        throw new Error(`App-like route browser smoke recorded ${browserFailureCount + flowFailureCount} issue(s)`)
    }
}

async function installRouteProbe(page: Page, probeDurationMs: number): Promise<void> {
    await page.evaluate(
        ({
            chatPageSelector,
            durationMs,
            newSessionRoute,
            routeSurfaceSelector,
            sessionsIndexRoute,
            settingsRoute,
        }) => {
            const isTransparentRouteSurface = () => {
                const surface = document.querySelector(routeSurfaceSelector)
                if (!(surface instanceof HTMLElement)) {
                    return false
                }

                const backgroundColor = getComputedStyle(surface).backgroundColor.trim()
                return (
                    backgroundColor === 'transparent' ||
                    backgroundColor === 'rgba(0, 0, 0, 0)' ||
                    /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)$/.test(backgroundColor)
                )
            }
            const isSessionDetailPath = () => {
                const segments = window.location.pathname.split('/').filter(Boolean)
                return (
                    segments[0] === 'sessions' &&
                    segments.length === 2 &&
                    segments[1] !== 'new' &&
                    segments[1] !== 'settings'
                )
            }
            const resolveSurface = () => {
                if (document.querySelector('input[name="accessToken"]')) return 'login'
                if (window.location.pathname === settingsRoute) return 'settings'
                if (window.location.pathname === newSessionRoute) return 'new-session'
                if (window.location.pathname.endsWith('/terminal')) return 'terminal'
                if (window.location.pathname.endsWith('/file')) return 'file'
                if (window.location.pathname.endsWith('/files')) return 'files'
                if (isSessionDetailPath()) {
                    return 'session-detail'
                }
                if (
                    window.location.pathname === sessionsIndexRoute &&
                    document.querySelector('[data-testid="sessions-list-pane"]')
                ) {
                    return 'sessions-list'
                }
                return 'unknown'
            }

            ;(
                window as typeof window & {
                    __VIBY_APP_LIKE_ROUTE_PROBE__?: Promise<AppLikeRouteProbeFrame[]>
                    __VIBY_APP_LIKE_ROUTE_PROBE_FRAMES__?: AppLikeRouteProbeFrame[]
                }
            ).__VIBY_APP_LIKE_ROUTE_PROBE__ = new Promise((resolve) => {
                const frames: AppLikeRouteProbeFrame[] = []
                ;(
                    window as typeof window & {
                        __VIBY_APP_LIKE_ROUTE_PROBE_FRAMES__?: AppLikeRouteProbeFrame[]
                    }
                ).__VIBY_APP_LIKE_ROUTE_PROBE_FRAMES__ = frames
                const startedAt = performance.now()
                const sample = () => {
                    const bodyText = document.body?.innerText?.trim() ?? ''
                    frames.push({
                        atMs: Math.round(performance.now() - startedAt),
                        pathname: window.location.pathname,
                        surface: resolveSurface(),
                        bodyTextLength: bodyText.length,
                        sessionChatCount: document.querySelectorAll(chatPageSelector).length,
                        sessionsListPaneCount: document.querySelectorAll('[data-testid="sessions-list-pane"]').length,
                        heroLoading: Boolean(document.querySelector('[data-testid="loading-state-hero"]')),
                        routePending: Boolean(document.querySelector('[data-testid="session-route-pending"]')),
                        detailPending: Boolean(document.querySelector('[data-testid="session-chat-detail-pending"]')),
                        loginVisible: Boolean(document.querySelector('input[name="accessToken"]')),
                        routeSurfaceTransparent: isTransparentRouteSurface(),
                    })

                    if (performance.now() - startedAt >= durationMs) {
                        resolve(frames)
                        return
                    }

                    requestAnimationFrame(sample)
                }
                requestAnimationFrame(sample)
            })
        },
        {
            chatPageSelector: SESSION_CHAT_PAGE_SELECTOR,
            durationMs: probeDurationMs,
            newSessionRoute: NEW_SESSION_ROUTE,
            routeSurfaceSelector: SESSION_ROUTE_PAGE_SURFACE_SELECTOR,
            sessionsIndexRoute: SESSIONS_INDEX_ROUTE,
            settingsRoute: SETTINGS_ROUTE,
        }
    )
}
