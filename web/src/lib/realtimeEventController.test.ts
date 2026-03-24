import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Session, SessionSummary, SessionsResponse, SyncEvent } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { getMessageWindowState, ingestIncomingMessages } from './message-window-store'
import { createRealtimeEventController } from './realtimeEventController'

function createSessionSummary(
    overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>
): SessionSummary {
    const {
        id,
        latestActivityAt = 0,
        latestActivityKind = 'ready',
        latestCompletedReplyAt = 0,
        ...restOverrides
    } = overrides

    return {
        id,
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        latestActivityAt,
        latestActivityKind,
        latestCompletedReplyAt,
        lifecycleState: 'closed',
        lifecycleStateSince: 0,
        metadata: {
            path: '/tmp/project',
            flavor: 'codex',
            summary: { text: 'Summary', updatedAt: 0 }
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        model: null,
        modelReasoningEffort: null,
        ...restOverrides
    }
}

function createSessionRecord(overrides: Partial<Session> & Pick<Session, 'id'>): Session {
    const { id, ...restOverrides } = overrides

    return {
        id,
        seq: 1,
        createdAt: 1_000,
        updatedAt: 1_000,
        active: true,
        activeAt: 1_000,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex'
        },
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {}
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1_000,
        todos: undefined,
        teamState: undefined,
        model: null,
        modelReasoningEffort: null,
        permissionMode: undefined,
        collaborationMode: undefined,
        ...restOverrides
    }
}

describe('createRealtimeEventController', () => {
    it('recomputes session summary lifecycle state when a realtime patch changes active state', () => {
        const queryClient = new QueryClient()
        const session = createSessionSummary({
            id: 'session-1',
            active: true,
            thinking: true,
            activeAt: 1_000,
            updatedAt: 2_000,
            lifecycleState: 'running',
            lifecycleStateSince: 1_000
        })

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [session]
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'session-updated',
            sessionId: session.id,
            data: {
                active: false,
                thinking: false,
                updatedAt: 3_000
            }
        } as SyncEvent)

        const result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions[0]).toMatchObject({
            active: false,
            thinking: false,
            updatedAt: 3_000,
            lifecycleState: 'closed',
            lifecycleStateSince: 3_000
        })
    })

    it('keeps archived sessions archived when inactive patches arrive', () => {
        const queryClient = new QueryClient()
        const session = createSessionSummary({
            id: 'session-archived',
            active: false,
            thinking: false,
            updatedAt: 5_000,
            lifecycleState: 'archived',
            lifecycleStateSince: 4_000
        })

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [session]
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'session-updated',
            sessionId: session.id,
            data: {
                active: false,
                updatedAt: 6_000
            }
        } as SyncEvent)

        const result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions[0]).toMatchObject({
            lifecycleState: 'archived',
            lifecycleStateSince: 4_000
        })
    })

    it('moves a just-stopped session into archived once lifecycle metadata arrives', () => {
        const queryClient = new QueryClient()
        const session = createSessionSummary({
            id: 'session-awaiting-input',
            active: true,
            thinking: false,
            updatedAt: 2_000,
            latestActivityAt: 2_000,
            latestActivityKind: 'ready',
            latestCompletedReplyAt: 2_000,
            lifecycleState: 'running',
            lifecycleStateSince: 1_000
        })

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [session]
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'session-updated',
            sessionId: session.id,
            data: {
                active: false,
                thinking: false,
                updatedAt: 3_000
            }
        } as SyncEvent)

        controller.handleEvent({
            type: 'session-updated',
            sessionId: session.id,
            data: {
                metadata: {
                    lifecycleState: 'archived',
                    lifecycleStateSince: 3_100
                }
            }
        } as SyncEvent)

        const result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions[0]).toMatchObject({
            active: false,
            lifecycleState: 'archived',
            lifecycleStateSince: 3_100
        })
    })

    it('keeps sessions summary live config fields in sync when a realtime patch arrives', () => {
        const queryClient = new QueryClient()
        const session = createSessionSummary({
            id: 'session-live-config',
            active: true,
            lifecycleState: 'running',
            lifecycleStateSince: 1_000,
            modelReasoningEffort: null,
            permissionMode: 'default',
            collaborationMode: 'default'
        })

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [session]
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'session-updated',
            sessionId: session.id,
            data: {
                modelReasoningEffort: 'high',
                permissionMode: 'yolo',
                collaborationMode: 'plan'
            }
        } as SyncEvent)

        const result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions[0]).toMatchObject({
            modelReasoningEffort: 'high',
            permissionMode: 'yolo',
            collaborationMode: 'plan'
        })
    })

    it('updates session list activity from incoming reply messages without waiting for a refetch', () => {
        const queryClient = new QueryClient()
        const replyAt = 2_000_000_000_000
        const session = createSessionSummary({
            id: 'session-live',
            active: true,
            thinking: false,
            updatedAt: 1_000,
            latestActivityAt: 900,
            latestActivityKind: 'user',
            latestCompletedReplyAt: null,
            lifecycleState: 'running',
            lifecycleStateSince: 500
        })

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [session]
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'message-received',
            sessionId: session.id,
            message: {
                id: 'message-1',
                seq: 1,
                localId: null,
                createdAt: replyAt,
                content: {
                    role: 'agent',
                    content: {
                        type: 'codex',
                        data: {
                            type: 'message',
                            message: 'Still responding'
                        }
                    }
                }
            }
        })

        const result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions[0]).toMatchObject({
            updatedAt: 1_000,
            latestActivityAt: replyAt,
            latestActivityKind: 'reply',
            latestCompletedReplyAt: null
        })

        controller.handleEvent({
            type: 'message-received',
            sessionId: session.id,
            message: {
                id: 'message-2',
                seq: 2,
                localId: null,
                createdAt: replyAt + 1,
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: {
                            type: 'ready'
                        }
                    }
                }
            }
        })

        const readyResult = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(readyResult?.sessions[0]).toMatchObject({
            updatedAt: replyAt + 1,
            latestActivityAt: replyAt + 1,
            latestActivityKind: 'ready',
            latestCompletedReplyAt: replyAt
        })
    })

    it('normalizes second-based message timestamps before patching session summaries', () => {
        const queryClient = new QueryClient()
        const replyAtSeconds = 1_750_000_000
        const replyAtMillis = replyAtSeconds * 1000
        const session = createSessionSummary({
            id: 'session-seconds',
            active: true,
            thinking: false,
            updatedAt: 1_000,
            latestActivityAt: 900,
            latestActivityKind: 'user',
            latestCompletedReplyAt: null,
            lifecycleState: 'running',
            lifecycleStateSince: 500
        })

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [session]
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'message-received',
            sessionId: session.id,
            message: {
                id: 'message-seconds',
                seq: 1,
                localId: null,
                createdAt: replyAtSeconds,
                content: {
                    role: 'agent',
                    content: {
                        type: 'codex',
                        data: {
                            type: 'message',
                            message: 'Normalized'
                        }
                    }
                }
            }
        })

        const result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions[0]).toMatchObject({
            updatedAt: 1_000,
            latestActivityAt: replyAtMillis,
            latestActivityKind: 'reply',
            latestCompletedReplyAt: null
        })
    })

    it('keeps running session order stable while a turn streams and after ready arrives', () => {
        const queryClient = new QueryClient()
        const replyAt = 2_000_000_000_000
        const sessions = [
            createSessionSummary({
                id: 'session-stable',
                active: true,
                thinking: false,
                updatedAt: 2_000,
                latestActivityAt: 2_000,
                latestActivityKind: 'ready',
                latestCompletedReplyAt: 2_000,
                lifecycleState: 'running',
                lifecycleStateSince: 1_000
            }),
            createSessionSummary({
                id: 'session-streaming',
                active: true,
                thinking: false,
                updatedAt: 1_000,
                latestActivityAt: 900,
                latestActivityKind: 'user',
                latestCompletedReplyAt: null,
                lifecycleState: 'running',
                lifecycleStateSince: 500
            })
        ]

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'message-received',
            sessionId: 'session-streaming',
            message: {
                id: 'message-streaming',
                seq: 1,
                localId: null,
                createdAt: replyAt,
                content: {
                    role: 'agent',
                    content: {
                        type: 'codex',
                        data: {
                            type: 'message',
                            message: 'Still responding'
                        }
                    }
                }
            }
        })

        let result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions.map((session) => session.id)).toEqual(['session-stable', 'session-streaming'])
        expect(result?.sessions[1]).toMatchObject({
            id: 'session-streaming',
            updatedAt: 1_000,
            latestActivityAt: replyAt,
            latestActivityKind: 'reply'
        })

        controller.handleEvent({
            type: 'message-received',
            sessionId: 'session-streaming',
            message: {
                id: 'message-ready',
                seq: 2,
                localId: null,
                createdAt: replyAt + 1,
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: {
                            type: 'ready'
                        }
                    }
                }
            }
        })

        result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions.map((session) => session.id)).toEqual(['session-stable', 'session-streaming'])
        expect(result?.sessions[1]).toMatchObject({
            id: 'session-streaming',
            updatedAt: replyAt + 1,
            latestCompletedReplyAt: replyAt
        })
    })

    it('keeps full-session realtime updates with pending requests below newer stable sessions', () => {
        const queryClient = new QueryClient()

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [
                createSessionSummary({
                    id: 'session-stable',
                    active: true,
                    updatedAt: 2_000,
                    latestActivityAt: 2_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 2_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 1_000
                }),
                createSessionSummary({
                    id: 'session-awaiting-input',
                    active: true,
                    updatedAt: 1_000,
                    latestActivityAt: 1_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 1_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 500
                })
            ]
        })

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'session-updated',
            sessionId: 'session-awaiting-input',
            data: createSessionRecord({
                id: 'session-awaiting-input',
                updatedAt: 9_000,
                activeAt: 1_000,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    flavor: 'codex',
                    lifecycleState: 'running',
                    lifecycleStateSince: 500
                },
                agentState: {
                    controlledByUser: false,
                    requests: {
                        'request-1': {
                            tool: 'read_file',
                            arguments: {},
                            createdAt: 1_500
                        }
                    },
                    completedRequests: {}
                }
            })
        } as SyncEvent)

        const result = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
        expect(result?.sessions.map((session) => session.id)).toEqual(['session-stable', 'session-awaiting-input'])
        expect(result?.sessions[1]).toMatchObject({
            id: 'session-awaiting-input',
            updatedAt: 9_000,
            pendingRequestsCount: 1
        })
    })

    it('tracks transient session stream snapshots outside the persisted message list', () => {
        const queryClient = new QueryClient()
        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'session-stream-updated',
            sessionId: 'session-stream',
            stream: {
                streamId: 'stream-1',
                startedAt: 10,
                updatedAt: 20,
                text: 'Hello'
            }
        })

        expect(getMessageWindowState('session-stream').stream).toEqual({
            streamId: 'stream-1',
            startedAt: 10,
            updatedAt: 20,
            text: 'Hello'
        })

        controller.handleEvent({
            type: 'session-stream-cleared',
            sessionId: 'session-stream',
            streamId: 'stream-1'
        } as SyncEvent)

        expect(getMessageWindowState('session-stream').stream).toBeNull()
    })

    it('removes session detail, summary, and message window state when a session is removed', () => {
        const queryClient = new QueryClient()
        const session = createSessionSummary({
            id: 'session-removed',
            active: false,
            updatedAt: 2_000,
            lifecycleState: 'closed',
            lifecycleStateSince: 2_000
        })

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [session]
        })
        queryClient.setQueryData(queryKeys.session(session.id), {
            session: createSessionRecord({
                id: session.id,
                active: false,
                updatedAt: 2_000,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    flavor: 'codex',
                    lifecycleState: 'closed',
                    lifecycleStateSince: 2_000
                }
            })
        })
        ingestIncomingMessages(session.id, [{
            id: 'message-1',
            seq: 1,
            localId: null,
            createdAt: 1_000,
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'hello'
                }
            }
        }])

        const controller = createRealtimeEventController({
            queryClient,
            onEvent: vi.fn()
        })

        controller.handleEvent({
            type: 'session-removed',
            sessionId: session.id,
            data: {}
        } as SyncEvent)

        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions).toEqual([])
        expect(queryClient.getQueryData(queryKeys.session(session.id))).toBeUndefined()
        expect(getMessageWindowState(session.id).messages).toEqual([])
    })
})
