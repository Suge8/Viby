import { describe, expect, it, vi, beforeEach } from 'vitest'

const harness = vi.hoisted(() => ({
    ensureLatestMessagesLoaded: vi.fn(async () => undefined),
    recordRuntimeAssetFailureRecovery: vi.fn(),
    loadWorkspaceModule: vi.fn()
}))

vi.mock('@/components/SessionChatWorkspace', () => ({
    __esModule: true,
    default: (() => {
        harness.loadWorkspaceModule()
        return null
    })()
}))

vi.mock('@/lib/message-window-store', () => ({
    ensureLatestMessagesLoaded: harness.ensureLatestMessagesLoaded
}))

vi.mock('@/lib/query-keys', () => ({
    SESSION_SCOPED_QUERY_PREFIXES: [
        'session',
        'skills',
        'slash-commands',
        'git-status',
        'session-files',
        'session-directory',
        'session-file',
        'git-file-diff',
    ],
    queryKeys: {
        session: (sessionId: string) => ['session', sessionId],
    }
}))

vi.mock('@/lib/runtimeAssetRecovery', () => ({
    recordRuntimeAssetFailureRecovery: harness.recordRuntimeAssetFailureRecovery
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
        harness.ensureLatestMessagesLoaded.mockClear()
        harness.recordRuntimeAssetFailureRecovery.mockClear()
        harness.loadWorkspaceModule.mockClear()
    })

    it('preloads the latest message snapshot together with session detail data', async () => {
        const api = {
            getSession: vi.fn(async () => ({ session: { id: 'session-1' } }))
        }
        const queryClient = {
            prefetchQuery: vi.fn(async ({ queryFn }: { queryFn: () => Promise<unknown> }) => await queryFn())
        }

        const { preloadSessionDetailRoute } = await loadSessionDetailRoutePreloadModule()
        await preloadSessionDetailRoute({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1'
        })

        expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(1)
        expect(harness.ensureLatestMessagesLoaded).toHaveBeenCalledWith(api, 'session-1')
    })

    it('keeps intent-only preloads lightweight by skipping latest messages when requested', async () => {
        const api = {
            getSession: vi.fn(async () => ({ session: { id: 'session-1' } }))
        }
        const queryClient = {
            prefetchQuery: vi.fn(async ({ queryFn }: { queryFn: () => Promise<unknown> }) => await queryFn())
        }

        const { preloadSessionDetailRoute } = await loadSessionDetailRoutePreloadModule()
        await preloadSessionDetailRoute({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1',
            includeLatestMessages: false
        })

        expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(1)
        expect(harness.ensureLatestMessagesLoaded).not.toHaveBeenCalled()
    })

    it('keeps intent-only preloads off the chat workspace runtime path', async () => {
        const api = {
            getSession: vi.fn(async () => ({ session: { id: 'session-1' } }))
        }
        const queryClient = {
            prefetchQuery: vi.fn(async ({ queryFn }: { queryFn: () => Promise<unknown> }) => await queryFn())
        }

        const { preloadSessionDetailIntent } = await loadSessionDetailRoutePreloadModule()
        preloadSessionDetailIntent({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1',
            recoveryHref: '/sessions/session-1'
        })

        await vi.dynamicImportSettled()

        expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(1)
        expect(harness.ensureLatestMessagesLoaded).not.toHaveBeenCalled()
        expect(harness.loadWorkspaceModule).not.toHaveBeenCalled()
    })

    it('keeps the chat experience preload off the workspace runtime path by default', async () => {
        const { preloadSessionChatExperience } = await loadSessionRoutePreloadModule()

        await preloadSessionChatExperience()

        expect(harness.loadWorkspaceModule).not.toHaveBeenCalled()
    })

    it('keeps explicit workspace preload on the module path without touching message fetch ownership', async () => {
        const { preloadSessionChatExperience } = await loadSessionRoutePreloadModule()

        await expect(preloadSessionChatExperience({ includeWorkspace: true })).resolves.toBeUndefined()

        expect(harness.ensureLatestMessagesLoaded).not.toHaveBeenCalled()
    })

    it('warms workspace runtime in the background without blocking data warmup', async () => {
        const api = {
            getSession: vi.fn(async () => ({ session: { id: 'session-1' } }))
        }
        const queryClient = {
            prefetchQuery: vi.fn(async ({ queryFn }: { queryFn: () => Promise<unknown> }) => await queryFn())
        }

        const { warmSessionDetailRouteData } = await loadSessionDetailRoutePreloadModule()
        warmSessionDetailRouteData({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1'
        })

        await vi.dynamicImportSettled()

        expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(1)
        expect(harness.ensureLatestMessagesLoaded).toHaveBeenCalledWith(api, 'session-1')
    })

    it('skips data preloads when there is no api client', async () => {
        const queryClient = {
            prefetchQuery: vi.fn()
        }

        const { preloadSessionDetailRoute } = await loadSessionDetailRoutePreloadModule()
        await preloadSessionDetailRoute({
            api: null,
            queryClient: queryClient as never,
            sessionId: 'session-1'
        })

        expect(queryClient.prefetchQuery).not.toHaveBeenCalled()
        expect(harness.ensureLatestMessagesLoaded).not.toHaveBeenCalled()
    })
})
