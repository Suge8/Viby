import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { ingestIncomingMessages, getMessageWindowState } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import type { Session, SessionsResponse } from '@/types/api'
import {
    markSessionPendingUserTurnInQueryCache,
    removeSessionClientState,
    writeSessionToQueryCache
} from './sessionQueryCache'

function createSession(): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1_000,
        updatedAt: 2_000,
        active: false,
        activeAt: 1_500,
        metadata: {
            path: '/Users/demo/Project/Viby',
            host: 'demo.local',
            flavor: 'codex',
            lifecycleState: 'closed',
            lifecycleStateSince: 2_000
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 2_000,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'default',
        collaborationMode: 'default',
        todos: undefined,
        teamState: undefined
    }
}

describe('removeSessionClientState', () => {
    it('removes session detail, list summary, and message window state through one helper', async () => {
        const queryClient = new QueryClient()
        const session = createSession()

        queryClient.setQueryData(queryKeys.session(session.id), { session })
        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [{
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
                    flavor: session.metadata?.flavor ?? null
                },
                todoProgress: null,
                pendingRequestsCount: 0,
                resumeAvailable: false,
                model: session.model,
                modelReasoningEffort: session.modelReasoningEffort,
                permissionMode: session.permissionMode,
                collaborationMode: session.collaborationMode
            }]
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
            sessions: [{
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
                    flavor: session.metadata?.flavor ?? null
                },
                todoProgress: null,
                pendingRequestsCount: 0,
                resumeAvailable: false,
                model: session.model,
                modelReasoningEffort: session.modelReasoningEffort,
                permissionMode: session.permissionMode,
                collaborationMode: session.collaborationMode
            }]
        })

        writeSessionToQueryCache(queryClient, {
            ...session,
            active: true,
            metadata: {
                ...session.metadata!,
                lifecycleState: 'running',
                lifecycleStateSince: 1_500
            }
        })

        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]).toMatchObject({
            latestActivityAt: 2_500,
            latestActivityKind: 'user',
            latestCompletedReplyAt: 2_000,
            lifecycleState: 'running'
        })
    })
})

describe('markSessionPendingUserTurnInQueryCache', () => {
    it('moves the list summary into pending-user-turn immediately after send start', () => {
        const queryClient = new QueryClient()
        const session = createSession()

        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, {
            sessions: [{
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
                    flavor: session.metadata?.flavor ?? null
                },
                todoProgress: null,
                pendingRequestsCount: 0,
                resumeAvailable: false,
                model: session.model,
                modelReasoningEffort: session.modelReasoningEffort,
                permissionMode: session.permissionMode,
                collaborationMode: session.collaborationMode
            }]
        })

        markSessionPendingUserTurnInQueryCache(queryClient, session.id, 3_000)

        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]).toMatchObject({
            updatedAt: 3_000_000,
            latestActivityAt: 3_000_000,
            latestActivityKind: 'user',
            latestCompletedReplyAt: 2_000
        })
    })
})
