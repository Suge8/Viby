// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { queryKeys } from '@/lib/query-keys'
import type { Session } from '@/types/api'
import { useTeamMemberControlActions } from './useTeamMemberControlActions'

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
            <I18nProvider>
                <QueryClientProvider client={queryClient}>
                    {props.children}
                </QueryClientProvider>
            </I18nProvider>
        )
    }
}

function createSession(): Session {
    return {
        id: 'member-session-1',
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
        collaborationMode: 'default',
        todos: undefined,
        teamContext: {
            projectId: 'project-1',
            sessionRole: 'member',
            managerSessionId: 'manager-session-1',
            managerTitle: 'Manager Project',
            memberId: 'member-1',
            memberRole: 'implementer',
            memberRevision: 1,
            controlOwner: 'user',
            membershipState: 'active',
            projectStatus: 'active'
        }
    }
}

describe('useTeamMemberControlActions', () => {
    afterEach(() => {
        cleanup()
    })

    it('invalidates team history with the same authoritative owner as team project refresh', async () => {
        const queryClient = createQueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
        const session = createSession()
        const api = {
            takeOverTeamMember: vi.fn(async () => session)
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(
            () => useTeamMemberControlActions(api, {
                memberId: 'member-1',
                projectId: 'project-1',
                sessionId: 'member-session-1',
                managerSessionId: 'manager-session-1'
            }),
            { wrapper: createWrapper(queryClient) }
        )

        await act(async () => {
            await result.current.takeOver()
        })

        await waitFor(() => {
            expect(result.current.isPending).toBe(false)
        })

        expect(api.takeOverTeamMember).toHaveBeenCalledWith('member-1')
        expect(queryClient.getQueryData<{ session: Session }>(queryKeys.session('member-session-1'))?.session).toEqual(session)
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.teamProject('project-1') })
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.teamProjectHistory('project-1') })
    })
})
