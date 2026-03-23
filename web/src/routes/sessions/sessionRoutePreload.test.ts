import { describe, expect, it, vi, beforeEach } from 'vitest'

const harness = vi.hoisted(() => ({
    ensureLatestMessagesLoaded: vi.fn(async () => undefined),
    recordRuntimeAssetFailureRecovery: vi.fn(),
    loadChatRouteModule: vi.fn(),
    loadWorkspaceModule: vi.fn()
}))

vi.mock('@/routes/sessions/chat', () => ({
    __esModule: true,
    default: (() => {
        harness.loadChatRouteModule()
        return null
    })()
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

describe('sessionRoutePreload', () => {
    beforeEach(() => {
        vi.resetModules()
        harness.ensureLatestMessagesLoaded.mockClear()
        harness.recordRuntimeAssetFailureRecovery.mockClear()
        harness.loadChatRouteModule.mockClear()
        harness.loadWorkspaceModule.mockClear()
    })

    it('preloads the latest message snapshot together with session detail data', async () => {
        const api = {
            getSession: vi.fn(async () => ({ session: { id: 'session-1' } }))
        }
        const queryClient = {
            prefetchQuery: vi.fn(async ({ queryFn }: { queryFn: () => Promise<unknown> }) => await queryFn())
        }

        const { preloadSessionDetailRoute } = await loadSessionRoutePreloadModule()
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

        const { preloadSessionDetailRoute } = await loadSessionRoutePreloadModule()
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

        const { preloadSessionDetailIntent } = await loadSessionRoutePreloadModule()
        preloadSessionDetailIntent({
            api: api as never,
            queryClient: queryClient as never,
            sessionId: 'session-1',
            recoveryHref: '/sessions/session-1'
        })

        await Promise.resolve()

        expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(1)
        expect(harness.ensureLatestMessagesLoaded).not.toHaveBeenCalled()
        expect(harness.loadWorkspaceModule).not.toHaveBeenCalled()
    })

    it('skips data preloads when there is no api client', async () => {
        const queryClient = {
            prefetchQuery: vi.fn()
        }

        const { preloadSessionDetailRoute } = await loadSessionRoutePreloadModule()
        await preloadSessionDetailRoute({
            api: null,
            queryClient: queryClient as never,
            sessionId: 'session-1'
        })

        expect(queryClient.prefetchQuery).not.toHaveBeenCalled()
        expect(harness.ensureLatestMessagesLoaded).not.toHaveBeenCalled()
    })
})
