import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ingestIncomingMessages, getMessageWindowState } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import type { Session, SessionsResponse } from '@/types/api'
import { removeSessionClientState } from './sessionQueryCache'

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
    it('removes session detail, list summary, and message window state through one helper', () => {
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
        expect(getMessageWindowState(session.id).messages).toEqual([])
    })
})
