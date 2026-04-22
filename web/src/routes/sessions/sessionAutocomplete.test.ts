import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import {
    createSessionAutocompleteSuggestions,
    getSkillSuggestions,
    getSlashCommandSuggestions,
} from '@/routes/sessions/sessionAutocomplete'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })
}

describe('sessionAutocomplete', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('prefetches skills only when the skill prefix is used', async () => {
        const queryClient = createQueryClient()
        const api = {
            getCommandCapabilities: vi.fn(async () => ({
                success: true,
                capabilities: [
                    {
                        id: 'viby:build',
                        trigger: '$build',
                        label: '$build',
                        description: 'Build skill',
                        kind: 'viby_skill',
                        source: 'viby',
                        provider: 'shared',
                        sessionEffect: 'none',
                        requiresLifecycleOwner: false,
                        selectionMode: 'insert',
                        displayGroup: 'skill',
                        riskLevel: 'low',
                    },
                ],
            })),
        }
        const getSuggestions = createSessionAutocompleteSuggestions({
            driver: 'codex',
            api: api as never,
            queryClient,
            sessionId: 'session-1',
        })

        expect(await getSuggestions('$')).toEqual([
            expect.objectContaining({
                text: '$build',
                groupLabel: 'Viby Skills',
            }),
        ])
        await waitFor(() => {
            expect(api.getCommandCapabilities).toHaveBeenCalledTimes(1)
        })
    })

    it('returns unified slash command capabilities and prefetches them on demand', async () => {
        const queryClient = createQueryClient()
        const api = {
            getCommandCapabilities: vi.fn(async () => ({
                success: true,
                capabilities: [
                    {
                        id: 'codex:builtin:new',
                        trigger: '/new',
                        label: '/new',
                        description: 'Start a new chat',
                        kind: 'native_command',
                        source: 'builtin',
                        provider: 'codex',
                        sessionEffect: 'creates_session',
                        requiresLifecycleOwner: true,
                        selectionMode: 'action',
                        actionType: 'open_new_session',
                        displayGroup: 'session',
                        riskLevel: 'high',
                    },
                ],
            })),
        }

        const suggestions = await getSlashCommandSuggestions({
            agentType: 'codex',
            api: api as never,
            query: '/',
            queryClient,
            sessionId: 'session-1',
        })

        expect(suggestions).toEqual([
            expect.objectContaining({
                text: '/new',
                actionType: 'open_new_session',
                groupLabel: 'Session Actions',
            }),
        ])
        await waitFor(() => {
            expect(api.getCommandCapabilities).toHaveBeenCalledTimes(1)
        })
    })

    it('reuses cached command capability data for filtered slash suggestions', async () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.commandCapabilities('session-1'), {
            success: true,
            revision: 'rev-1',
            capabilities: [
                {
                    id: 'claude:project:custom',
                    trigger: '/custom',
                    label: '/custom',
                    description: 'Custom command',
                    kind: 'native_command',
                    source: 'project',
                    provider: 'claude',
                    sessionEffect: 'none',
                    requiresLifecycleOwner: false,
                    selectionMode: 'insert',
                    displayGroup: 'project',
                    riskLevel: 'low',
                },
            ],
        })

        const suggestions = await getSlashCommandSuggestions({
            agentType: 'codex',
            api: null,
            query: '/cus',
            queryClient,
            sessionId: 'session-1',
        })

        expect(suggestions).toEqual([
            expect.objectContaining({
                text: '/custom',
                description: 'Custom command',
                source: 'project',
            }),
        ])
    })

    it('revalidates invalidated capability queries and reuses cached data when the server replies notModified', async () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.commandCapabilities('session-1'), {
            success: true,
            revision: 'rev-1',
            capabilities: [
                {
                    id: 'gemini:project:ship',
                    trigger: '/ship',
                    label: '/ship',
                    description: 'Ship command',
                    kind: 'native_command',
                    source: 'project',
                    provider: 'gemini',
                    sessionEffect: 'none',
                    requiresLifecycleOwner: false,
                    selectionMode: 'insert',
                    displayGroup: 'project',
                    riskLevel: 'low',
                },
            ],
        })
        await queryClient.invalidateQueries({ queryKey: queryKeys.commandCapabilities('session-1') })
        const api = {
            getCommandCapabilities: vi.fn(async (_sessionId: string, revision?: string) => ({
                success: true,
                revision,
                notModified: true,
            })),
        }

        const suggestions = await getSlashCommandSuggestions({
            agentType: 'gemini',
            api: api as never,
            query: '/sh',
            queryClient,
            sessionId: 'session-1',
        })

        expect(suggestions).toEqual([
            expect.objectContaining({
                text: '/ship',
                description: 'Ship command',
            }),
        ])
        expect(api.getCommandCapabilities).toHaveBeenCalledWith('session-1', 'rev-1')
    })

    it('reuses cached capability data and keeps recent skills first for an empty skill query', async () => {
        const queryClient = createQueryClient()
        localStorage.setItem(
            'viby-recent-skills',
            JSON.stringify({
                deploy: 2,
                build: 1,
            })
        )
        queryClient.setQueryData(queryKeys.commandCapabilities('session-1'), {
            success: true,
            capabilities: [
                {
                    id: 'viby:build',
                    trigger: '$build',
                    label: '$build',
                    description: 'Build skill',
                    kind: 'viby_skill',
                    source: 'viby',
                    provider: 'shared',
                    sessionEffect: 'none',
                    requiresLifecycleOwner: false,
                    selectionMode: 'insert',
                    displayGroup: 'skill',
                    riskLevel: 'low',
                },
                {
                    id: 'viby:deploy',
                    trigger: '$deploy',
                    label: '$deploy',
                    description: 'Deploy skill',
                    kind: 'viby_skill',
                    source: 'viby',
                    provider: 'shared',
                    sessionEffect: 'none',
                    requiresLifecycleOwner: false,
                    selectionMode: 'insert',
                    displayGroup: 'skill',
                    riskLevel: 'low',
                },
            ],
        })

        const suggestions = await getSkillSuggestions({
            api: null,
            query: '$',
            queryClient,
            sessionId: 'session-1',
        })

        expect(suggestions.map((item) => item.text)).toEqual(['$deploy', '$build'])
    })
})
