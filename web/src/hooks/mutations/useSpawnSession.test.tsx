// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Session, SessionsResponse } from '@/types/api'
import { useSpawnSession } from './useSpawnSession'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false
            }
        }
    })
}

function createWrapper(queryClient: QueryClient): (props: PropsWithChildren) => React.JSX.Element {
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return (
            <QueryClientProvider client={queryClient}>
                {props.children}
            </QueryClientProvider>
        )
    }
}

function createSession(): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1_000,
        updatedAt: 1_000,
        active: true,
        activeAt: 1_000,
        metadata: {
            path: '/Users/demo/Project/Viby',
            host: 'demo.local',
            flavor: 'codex',
            machineId: 'machine-1',
            lifecycleState: 'running',
            lifecycleStateSince: 1_000
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1_000,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'plan',
        todos: undefined,
        teamState: undefined
    }
}

describe('useSpawnSession', () => {
    it('writes the spawned session snapshot directly into cache without invalidating', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        queryClient.setQueryData<SessionsResponse>(queryKeys.sessions, { sessions: [] })

        const spawnedSession = createSession()
        const api = {
            spawnSession: vi.fn(async () => ({
                type: 'success' as const,
                session: spawnedSession
            }))
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useSpawnSession(api),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            const response = await result.current.spawnSession({
                machineId: 'machine-1',
                directory: '/Users/demo/Project/Viby',
                agent: 'codex'
            })
            expect(response).toEqual({
                type: 'success',
                session: spawnedSession
            })
        })

        expect(api.spawnSession).toHaveBeenCalledWith({
            machineId: 'machine-1',
            directory: '/Users/demo/Project/Viby',
            agent: 'codex'
        })
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('session-1'))?.session).toEqual(spawnedSession)
        expect(queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)?.sessions[0]?.id).toBe('session-1')
        expect(invalidateQueries).not.toHaveBeenCalled()
    })
})
