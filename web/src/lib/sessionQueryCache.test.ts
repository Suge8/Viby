import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessageWindowState, ingestIncomingMessages } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import type { ResumableSession } from '@/lib/sessionQueryCacheSupport'
import {
    createTestSession,
    createTestSessionSummary,
    TEST_NEXT_PROJECT_PATH,
    TEST_PROJECT_PATH,
} from '@/test/sessionFactories'
import type { Session, SessionResponse, SessionSummary, SessionsResponse } from '@/types/api'
import {
    createSessionSeedFromSummary,
    getSessionPlaceholderSeed,
    markSessionPendingUserTurnInQueryCache,
    patchSessionInQueryCache,
    removeSessionClientState,
    writeSessionToQueryCache,
    writeSessionViewToQueryCache,
} from './sessionQueryCache'

function createSession(): Session {
    return createTestSession({
        id: 'session-1',
        updatedAt: 2_000,
        active: false,
        activeAt: 1_500,
        metadata: {
            path: TEST_PROJECT_PATH,
            host: 'demo.local',
            driver: 'codex',
            lifecycleState: 'closed',
            lifecycleStateSince: 2_000,
        },
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 2_000,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'default',
        collaborationMode: 'default',
    })
}

function createSummary(overrides?: Partial<SessionSummary>): SessionSummary {
    return createTestSessionSummary({
        id: 'session-1',
        active: false,
        thinking: false,
        activeAt: 1_500,
        updatedAt: 2_000,
        latestActivityAt: 2_000,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: 2_000,
        lifecycleState: 'closed',
        lifecycleStateSince: 2_000,
        metadata: {
            path: TEST_PROJECT_PATH,
            driver: 'codex',
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        resumeStrategy: 'none',
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'default',
        collaborationMode: 'default',
        ...overrides,
    })
}

beforeEach(() => {
    localStorage.clear()
})

describe('createSessionSeedFromSummary', () => {
    it('preserves the authoritative driver when seeding a session from summary data', () => {
        const session = createSessionSeedFromSummary(createSummary())

        expect(session.metadata).toMatchObject({
            driver: 'codex',
        })
        expect(session.metadata && 'flavor' in session.metadata).toBe(false)
    })

    it('preserves the resumable hint from the authoritative list summary', () => {
        const session = createSessionSeedFromSummary(
            createSummary({
                resumeAvailable: true,
            })
        ) as ResumableSession

        expect(session.resumeAvailable).toBe(true)
    })

    it('preserves explicitly open lifecycle when building a placeholder session seed', () => {
        const session = createSessionSeedFromSummary(
            createSummary({
                lifecycleState: 'open',
                lifecycleStateSince: 2_100,
                resumeAvailable: true,
            })
        )

        expect(session.metadata).toMatchObject({
            lifecycleState: 'open',
            lifecycleStateSince: 2_100,
        })
        expect((session as ResumableSession).resumeAvailable).toBe(true)
    })

    it('preserves a valid summary driver when the summary points at Gemini', () => {
        const session = createSessionSeedFromSummary(
            createSummary({
                metadata: {
                    path: TEST_PROJECT_PATH,
                    driver: 'gemini',
                },
            })
        )

        expect(session.metadata).toMatchObject({
            driver: 'gemini',
        })
        expect(session.metadata && 'flavor' in session.metadata).toBe(false)
    })

    it('keeps malformed summary driver data unknown instead of guessing', () => {
        const session = createSessionSeedFromSummary(
            createSummary({
                metadata: {
                    path: TEST_PROJECT_PATH,
                    driver: 'invalid' as never,
                },
            })
        )

        expect(session.metadata).toMatchObject({
            driver: null,
        })
        expect(session.metadata && 'flavor' in session.metadata).toBe(false)
    })
})

describe('getSessionPlaceholderSeed', () => {
    it('builds a summary placeholder seed with the authoritative driver before detail loads', () => {
        const queryClient = new QueryClient()
        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [createSummary()],
        })

        const result = getSessionPlaceholderSeed(queryClient, 'session-1')

        expect(result.source).toBe('summary')
        expect(result.detailHydrated).toBe(false)
        expect(result.response?.session.metadata).toMatchObject({
            driver: 'codex',
        })
        expect(result.response?.session.metadata && 'flavor' in result.response.session.metadata).toBe(false)
    })

    it('marks cache seeds as detail-hydrated when they came from a session view snapshot', () => {
        const queryClient = new QueryClient()
        const session = createSession()

        writeSessionViewToQueryCache(queryClient, {
            session: {
                ...session,
                resumeAvailable: false,
            },
            latestWindow: {
                messages: [],
                page: {
                    limit: 100,
                    beforeSeq: null,
                    nextBeforeSeq: null,
                    hasMore: false,
                },
            },
            stream: null,
            watermark: {
                latestSeq: 0,
                updatedAt: session.updatedAt,
            },
            interactivity: {
                lifecycleState: 'closed',
                resumeAvailable: false,
                allowSendWhenInactive: false,
                retryAvailable: false,
            },
        })

        const result = getSessionPlaceholderSeed(queryClient, session.id)

        expect(result.source).toBe('cache')
        expect(result.detailHydrated).toBe(true)
    })
})

describe('patchSessionInQueryCache', () => {
    it('patches cached detail and list state through one owner while preserving resumable hints', () => {
        const queryClient = new QueryClient()
        const session: ResumableSession = {
            ...createSession(),
            resumeAvailable: true,
        }

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [],
        })
        writeSessionToQueryCache(queryClient, session)

        const nextSession = patchSessionInQueryCache(queryClient, session.id, (current) => {
            return {
                ...current,
                active: false,
                thinking: false,
                updatedAt: 2_500,
                metadata: current.metadata
                    ? {
                          ...current.metadata,
                          lifecycleState: 'open',
                          lifecycleStateSince: 2_500,
                      }
                    : current.metadata,
            }
        })

        expect(nextSession?.metadata).toMatchObject({
            lifecycleState: 'open',
            lifecycleStateSince: 2_500,
        })
        expect(
            (queryClient.getQueryData<SessionResponse>(queryKeys.session(session.id))?.session as ResumableSession)
                .resumeAvailable
        ).toBe(true)
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]).toMatchObject({
            lifecycleState: 'open',
            resumeAvailable: true,
        })
    })
})

describe('removeSessionClientState', () => {
    it('removes session detail, list summary, and message window state through one helper', async () => {
        const queryClient = new QueryClient()
        const session = createSession()

        queryClient.setQueryData(queryKeys.session(session.id), { session })
        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [
                {
                    id: session.id,
                    active: session.active,
                    thinking: session.thinking,
                    activeAt: session.activeAt,
                    updatedAt: session.updatedAt,
                    latestActivityAt: session.updatedAt,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: session.updatedAt,
                    lifecycleState: 'closed',
                    lifecycleStateSince: 2_000,
                    metadata: {
                        path: session.metadata?.path ?? '',
                        driver: session.metadata?.driver ?? null,
                    },
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: false,
                    resumeStrategy: 'none',
                    model: session.model,
                    modelReasoningEffort: session.modelReasoningEffort,
                    permissionMode: session.permissionMode,
                    collaborationMode: session.collaborationMode,
                },
            ],
        })
        ingestIncomingMessages(session.id, [
            {
                id: 'message-1',
                seq: 1,
                localId: null,
                createdAt: 1_000,
                content: {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: 'hello',
                    },
                },
            },
        ])

        expect(getMessageWindowState(session.id).messages).toHaveLength(1)

        removeSessionClientState(queryClient, session.id)

        expect(queryClient.getQueryData(queryKeys.session(session.id))).toBeUndefined()
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions).toEqual([])
        await waitFor(() => {
            expect(getMessageWindowState(session.id).messages).toEqual([])
        })
    })
})

describe('writeSessionToQueryCache', () => {
    it('preserves existing list message activity when the incoming session snapshot has no activity fields', () => {
        const queryClient = new QueryClient()
        const session = createSession()

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [
                {
                    id: session.id,
                    active: true,
                    thinking: false,
                    activeAt: 1_500,
                    updatedAt: 2_500,
                    latestActivityAt: 2_500,
                    latestActivityKind: 'user',
                    latestCompletedReplyAt: 2_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 1_500,
                    metadata: {
                        path: session.metadata?.path ?? '',
                        driver: session.metadata?.driver ?? null,
                    },
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: false,
                    resumeStrategy: 'none',
                    model: session.model,
                    modelReasoningEffort: session.modelReasoningEffort,
                    permissionMode: session.permissionMode,
                    collaborationMode: session.collaborationMode,
                },
            ],
        })

        writeSessionToQueryCache(queryClient, {
            ...session,
            active: true,
            metadata: {
                ...session.metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 1_500,
            },
        })

        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]).toMatchObject({
            latestActivityAt: 2_500,
            latestActivityKind: 'user',
            latestCompletedReplyAt: 2_000,
            lifecycleState: 'running',
        })
    })

    it('preserves resumable detail snapshots from the authoritative list summary when the raw session payload omits the token', () => {
        const queryClient = new QueryClient()
        const session = createSession()

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [
                createSummary({
                    active: false,
                    lifecycleState: 'closed',
                    resumeAvailable: true,
                }),
            ],
        })

        writeSessionToQueryCache(queryClient, {
            ...session,
            active: false,
            metadata: {
                ...session.metadata!,
                lifecycleState: 'closed',
                lifecycleStateSince: 2_000,
            },
        })

        expect(
            (queryClient.getQueryData<SessionResponse>(queryKeys.session(session.id))?.session as ResumableSession)
                .resumeAvailable
        ).toBe(true)
    })

    it('invalidates command capabilities when the authoritative scope changes', async () => {
        const queryClient = new QueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession()

        queryClient.setQueryData<SessionResponse>(queryKeys.session(session.id), { session })

        writeSessionToQueryCache(queryClient, {
            ...session,
            metadata: {
                ...session.metadata!,
                path: TEST_NEXT_PROJECT_PATH,
            },
        })

        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: queryKeys.commandCapabilities(session.id),
            })
        })
    })
})

describe('markSessionPendingUserTurnInQueryCache', () => {
    it('moves the list summary into pending-user-turn immediately after send start', () => {
        const queryClient = new QueryClient()
        const session = createSession()

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [
                {
                    id: session.id,
                    active: true,
                    thinking: false,
                    activeAt: 1_500,
                    updatedAt: 2_000,
                    latestActivityAt: 2_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 2_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 1_500,
                    metadata: {
                        path: session.metadata?.path ?? '',
                        driver: session.metadata?.driver ?? null,
                    },
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: false,
                    resumeStrategy: 'none',
                    model: session.model,
                    modelReasoningEffort: session.modelReasoningEffort,
                    permissionMode: session.permissionMode,
                    collaborationMode: session.collaborationMode,
                },
            ],
        })

        markSessionPendingUserTurnInQueryCache(queryClient, session.id, 3_000)

        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]).toMatchObject({
            updatedAt: 3_000_000,
            latestActivityAt: 3_000_000,
            latestActivityKind: 'user',
            latestCompletedReplyAt: 2_000,
        })
    })
})
