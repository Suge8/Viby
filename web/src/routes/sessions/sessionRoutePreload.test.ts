import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    prefetchQuery: vi.fn(async () => undefined),
    preloadMarkdownRenderer: vi.fn(async () => undefined),
    recordRuntimeAssetFailureRecovery: vi.fn(),
    preloadWorkspaceSurfaces: vi.fn(async () => undefined),
    writeSessionViewToQueryCache: vi.fn(),
}))

vi.mock('@/lib/sessionQueryCache', () => ({
    writeSessionViewToQueryCache: harness.writeSessionViewToQueryCache,
}))

vi.mock('@/components/sessionChatWorkspaceModules', () => ({
    preloadSessionChatWorkspaceSurfaces: harness.preloadWorkspaceSurfaces,
}))

vi.mock('@/components/markdown/loadMarkdownRenderer', () => ({
    preloadMarkdownRenderer: harness.preloadMarkdownRenderer,
}))

vi.mock('@/lib/query-keys', () => ({
    SESSION_SCOPED_QUERY_PREFIXES: [
        'session',
        'command-capabilities',
        'git-status',
        'session-files',
        'session-directory',
        'session-file',
        'git-file-diff',
    ],
    queryKeys: {
        session: (sessionId: string) => ['session', sessionId],
        commandCapabilities: (sessionId: string) => ['command-capabilities', sessionId],
    },
}))

vi.mock('@/lib/runtimeAssetRecovery', () => ({
    recordRuntimeAssetFailureRecovery: harness.recordRuntimeAssetFailureRecovery,
}))

async function loadSessionRoutePreloadModule() {
    return await import('./sessionRoutePreload')
}

async function loadSessionDetailRoutePreloadModule() {
    return await import('./sessionDetailRoutePreload')
}

describe('sessionRoutePreload', () => {
    beforeEach(() => {
        vi.resetModules()
        harness.prefetchQuery.mockClear()
        harness.preloadMarkdownRenderer.mockClear()
        harness.recordRuntimeAssetFailureRecovery.mockClear()
        harness.preloadWorkspaceSurfaces.mockClear()
        harness.writeSessionViewToQueryCache.mockClear()
    })

    it('preloads the latest message snapshot together with session detail data', async () => {
        const api = {
            getSessionView: vi.fn(async () => ({
                session: { id: 'session-1' },
                latestWindow: {
                    messages: [],
                    page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
                },
                stream: null,
                watermark: { latestSeq: 0, updatedAt: 0 },
                interactivity: {
                    lifecycleState: 'running',
                    resumeAvailable: false,
                    allowSendWhenInactive: false,
                    retryAvailable: true,
                },
            })),
            getCommandCapabilities: vi.fn(async () => ({
                success: true,
                capabilities: [],
            })),
        }
        const queryClient = {
            prefetchQuery: harness.prefetchQuery,
        }

        const { preloadSessionDetailRoute } = await loadSessionDetailRoutePreloadModule()
        await preloadSessionDetailRoute({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1',
        })

        expect(api.getSessionView).toHaveBeenCalledWith('session-1')
        expect(harness.writeSessionViewToQueryCache).toHaveBeenCalledTimes(1)
        expect(harness.prefetchQuery).toHaveBeenCalledTimes(1)
    }, 10_000)

    it('keeps explicit session detail critical preload on the workspace runtime path', async () => {
        const { preloadSessionDetailCriticalRoute } = await loadSessionDetailRoutePreloadModule()

        await preloadSessionDetailCriticalRoute({
            api: null,
            queryClient: { prefetchQuery: vi.fn() } as never,
            sessionId: 'session-1',
            includeWorkspaceRuntime: true,
        })

        expect(harness.preloadMarkdownRenderer).toHaveBeenCalledTimes(1)
        expect(harness.preloadWorkspaceSurfaces).toHaveBeenCalledTimes(1)
    })

    it('treats critical preload as the authoritative ready path when session detail data is available', async () => {
        let resolveSessionView!: () => void
        const api = {
            getSessionView: vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolveSessionView = () =>
                            resolve({
                                session: { id: 'session-1' },
                                latestWindow: {
                                    messages: [],
                                    page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
                                },
                                stream: null,
                                watermark: { latestSeq: 0, updatedAt: 0 },
                                interactivity: {
                                    lifecycleState: 'running',
                                    resumeAvailable: false,
                                    allowSendWhenInactive: false,
                                    retryAvailable: true,
                                },
                            })
                    })
            ),
        }

        const { preloadSessionDetailCriticalRoute } = await loadSessionDetailRoutePreloadModule()
        let settled = false
        const task = preloadSessionDetailCriticalRoute({
            api: api as never,
            queryClient: { prefetchQuery: harness.prefetchQuery } as never,
            sessionId: 'session-1',
            includeWorkspaceRuntime: true,
        }).then(() => {
            settled = true
        })

        await vi.waitFor(() => {
            expect(api.getSessionView).toHaveBeenCalledWith('session-1')
        })
        expect(settled).toBe(false)

        resolveSessionView()
        await task

        expect(harness.writeSessionViewToQueryCache).toHaveBeenCalledTimes(1)
    })

    it('keeps intent-only preloads off the data path, workspace runtime path, and markdown runtime path', async () => {
        const api = {
            getSessionView: vi.fn(async () => ({
                session: { id: 'session-1' },
                latestWindow: {
                    messages: [],
                    page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
                },
                stream: null,
                watermark: { latestSeq: 0, updatedAt: 0 },
                interactivity: {
                    lifecycleState: 'running',
                    resumeAvailable: false,
                    allowSendWhenInactive: false,
                    retryAvailable: true,
                },
            })),
            getCommandCapabilities: vi.fn(async () => ({
                success: true,
                capabilities: [],
            })),
        }
        const queryClient = {
            prefetchQuery: harness.prefetchQuery,
        }

        const { preloadSessionDetailIntent } = await loadSessionDetailRoutePreloadModule()
        preloadSessionDetailIntent({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1',
            recoveryHref: '/sessions/session-1',
        })

        await vi.dynamicImportSettled()

        expect(api.getSessionView).not.toHaveBeenCalled()
        expect(harness.writeSessionViewToQueryCache).not.toHaveBeenCalled()
        expect(harness.preloadWorkspaceSurfaces).not.toHaveBeenCalled()
        expect(harness.preloadMarkdownRenderer).not.toHaveBeenCalled()
    })

    it('keeps the chat experience preload off the workspace runtime path by default', async () => {
        const { preloadSessionChatExperience } = await loadSessionRoutePreloadModule()

        await preloadSessionChatExperience()

        expect(harness.preloadMarkdownRenderer).toHaveBeenCalledTimes(1)
        expect(harness.preloadWorkspaceSurfaces).not.toHaveBeenCalled()
    })

    it('keeps explicit workspace preload on the module path without touching message fetch ownership', async () => {
        const { preloadSessionChatExperience } = await loadSessionRoutePreloadModule()

        await expect(preloadSessionChatExperience({ includeWorkspace: true })).resolves.toBeUndefined()

        expect(harness.writeSessionViewToQueryCache).not.toHaveBeenCalled()
        expect(harness.preloadWorkspaceSurfaces).toHaveBeenCalledTimes(1)
    })

    it('reuses stable lazy-route promises for new session and settings preloads', async () => {
        const { loadNewSessionRouteModule, loadSettingsRouteModule } = await loadSessionRoutePreloadModule()

        expect(loadNewSessionRouteModule()).toBe(loadNewSessionRouteModule())
        expect(loadSettingsRouteModule()).toBe(loadSettingsRouteModule())
    })

    it('keeps ancillary background warmup off the session-view and workspace paths', async () => {
        const api = {
            getSessionView: vi.fn(),
        }
        const queryClient = {
            prefetchQuery: harness.prefetchQuery,
        }

        const { warmSessionDetailAncillaryRouteData } = await loadSessionDetailRoutePreloadModule()
        warmSessionDetailAncillaryRouteData({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1',
        })

        await vi.dynamicImportSettled()

        expect(api.getSessionView).not.toHaveBeenCalled()
        expect(harness.writeSessionViewToQueryCache).not.toHaveBeenCalled()
        expect(harness.prefetchQuery).toHaveBeenCalledTimes(1)
        expect(harness.preloadWorkspaceSurfaces).not.toHaveBeenCalled()
    })

    it('skips data preloads when there is no api client', async () => {
        const queryClient = {
            prefetchQuery: vi.fn(),
        }

        const { preloadSessionDetailRoute } = await loadSessionDetailRoutePreloadModule()
        await preloadSessionDetailRoute({
            api: null,
            queryClient: queryClient as never,
            sessionId: 'session-1',
        })

        expect(queryClient.prefetchQuery).not.toHaveBeenCalled()
        expect(harness.writeSessionViewToQueryCache).not.toHaveBeenCalled()
    })
})
