import { describe, expect, it } from 'bun:test'
import {
    type AppLikeRouteProbeFrame,
    formatAppLikeEvidenceSummary,
    getAppLikeRouteFlowFailureReasons,
    summarizeAppLikeRouteFlow,
} from './appLikeRouteEvidenceSupport'

describe('app-like route evidence support', () => {
    it('treats unknown low-text frames as blank-like failures', () => {
        const frames: AppLikeRouteProbeFrame[] = [
            {
                atMs: 0,
                pathname: '/sessions',
                surface: 'sessions-list',
                bodyTextLength: 128,
                sessionChatCount: 0,
                sessionsListPaneCount: 1,
                heroLoading: false,
                routePending: false,
                detailPending: false,
                loginVisible: false,
                routeSurfaceTransparent: false,
            },
            {
                atMs: 16,
                pathname: '/sessions/abc',
                surface: 'unknown',
                bodyTextLength: 8,
                sessionChatCount: 0,
                sessionsListPaneCount: 0,
                heroLoading: false,
                routePending: false,
                detailPending: false,
                loginVisible: false,
                routeSurfaceTransparent: false,
            },
        ]

        const summary = summarizeAppLikeRouteFlow(frames)

        expect(summary.blankFrameCount).toBe(1)
        expect(getAppLikeRouteFlowFailureReasons(summary)).toContain('blank-like frames: 1')
    })

    it('tracks hero-loading and login-visible failures separately', () => {
        const summary = summarizeAppLikeRouteFlow([
            {
                atMs: 0,
                pathname: '/sessions',
                surface: 'sessions-list',
                bodyTextLength: 140,
                sessionChatCount: 2,
                sessionsListPaneCount: 2,
                heroLoading: true,
                routePending: true,
                detailPending: false,
                loginVisible: true,
                routeSurfaceTransparent: true,
            },
        ])

        expect(summary.multiListPaneFrameCount).toBe(1)
        expect(summary.multiChatSurfaceFrameCount).toBe(1)
        expect(summary.heroLoadingFrameCount).toBe(1)
        expect(summary.loginVisibleFrameCount).toBe(1)
        expect(getAppLikeRouteFlowFailureReasons(summary)).toEqual([
            'multi list panes: 1',
            'multi chat surfaces: 1',
            'hero loading frames: 1',
            'login-visible frames: 1',
            'transparent route surface frames: 1',
        ])
    })

    it('renders markdown summary with flow details', () => {
        const summary = formatAppLikeEvidenceSummary({
            targetUrl: 'http://127.0.0.1:4173/sessions',
            finalUrl: 'http://127.0.0.1:4173/sessions/settings',
            outputDir: '/tmp/evidence',
            consoleErrors: 0,
            runtimeExceptions: 0,
            logErrors: 0,
            networkFailures: 0,
            controllerConflicts: 0,
            flowSummaries: [
                {
                    id: 'list-to-chat',
                    screenshotPath: '/tmp/evidence/list-to-chat.png',
                    summary: summarizeAppLikeRouteFlow([
                        {
                            atMs: 0,
                            pathname: '/sessions/abc',
                            surface: 'session-detail',
                            bodyTextLength: 240,
                            sessionChatCount: 1,
                            sessionsListPaneCount: 1,
                            heroLoading: false,
                            routePending: false,
                            detailPending: false,
                            loginVisible: false,
                            routeSurfaceTransparent: false,
                        },
                    ]),
                },
            ],
        })

        expect(summary).toContain('# App-Like Route Evidence Summary')
        expect(summary).toContain('### list-to-chat')
        expect(summary).toContain('- Failure reasons: none')
    })

    it('allows login-visible frames for cold login bootstrap flows', () => {
        const summary = formatAppLikeEvidenceSummary({
            targetUrl: 'http://127.0.0.1:4173/sessions',
            finalUrl: 'http://127.0.0.1:4173/sessions',
            outputDir: '/tmp/evidence',
            consoleErrors: 0,
            runtimeExceptions: 0,
            logErrors: 0,
            networkFailures: 0,
            controllerConflicts: 0,
            flowSummaries: [
                {
                    id: 'login-to-list',
                    screenshotPath: '/tmp/evidence/login-to-list.png',
                    allowLoginVisible: true,
                    summary: summarizeAppLikeRouteFlow([
                        {
                            atMs: 0,
                            pathname: '/sessions',
                            surface: 'login',
                            bodyTextLength: 160,
                            sessionChatCount: 0,
                            sessionsListPaneCount: 0,
                            heroLoading: false,
                            routePending: false,
                            detailPending: false,
                            loginVisible: true,
                            routeSurfaceTransparent: false,
                        },
                        {
                            atMs: 16,
                            pathname: '/sessions',
                            surface: 'sessions-list',
                            bodyTextLength: 240,
                            sessionChatCount: 0,
                            sessionsListPaneCount: 1,
                            heroLoading: false,
                            routePending: false,
                            detailPending: false,
                            loginVisible: false,
                            routeSurfaceTransparent: false,
                        },
                    ]),
                },
            ],
        })

        expect(summary).toContain('### login-to-list')
        expect(summary).toContain('- Login-visible frames: 1')
        expect(summary).toContain('- Login-visible allowed: yes')
        expect(summary).toContain('- Failure reasons: none')
    })
})
