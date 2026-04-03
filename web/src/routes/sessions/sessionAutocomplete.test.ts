import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { getSkillSuggestions } from '@/routes/sessions/SessionAutocompleteSkills'
import { getSlashCommandSuggestions } from '@/routes/sessions/SessionAutocompleteSlashCommands'
import { createSessionAutocompleteSuggestions } from '@/routes/sessions/sessionAutocomplete'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            }
        }
    })
}

describe('sessionAutocomplete', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('prefetches skills only when the skill prefix is used', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSkills: vi.fn(async () => ({
                success: true,
                skills: [{ name: 'build', description: 'Build skill' }]
            })),
            getSlashCommands: vi.fn(async () => ({
                success: true,
                commands: [{ name: 'custom', source: 'user', description: 'Custom command' }]
            }))
        }
        const getSuggestions = createSessionAutocompleteSuggestions({
            driver: 'codex',
            api: api as never,
            queryClient,
            sessionId: 'session-1'
        })

        expect(await getSuggestions('$')).toEqual([])
        await waitFor(() => {
            expect(api.getSkills).toHaveBeenCalledTimes(1)
        })
        expect(api.getSlashCommands).not.toHaveBeenCalled()
    })


    it('falls back to the legacy agentType option when the driver is absent', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSlashCommands: vi.fn(async () => ({
                success: true,
                commands: []
            }))
        }
        const getSuggestions = createSessionAutocompleteSuggestions({
            agentType: 'codex',
            api: api as never,
            queryClient,
            sessionId: 'session-1'
        })

        const suggestions = await getSuggestions('/')

        expect(suggestions.some((item) => item.text === '/review')).toBe(true)
    })

    it('defaults malformed drivers to Claude builtins without breaking cached queries', async () => {
        const queryClient = createQueryClient()
        const getSuggestions = createSessionAutocompleteSuggestions({
            driver: 'unknown',
            api: null,
            queryClient,
            sessionId: 'session-1'
        })

        const suggestions = await getSuggestions('/')

        expect(suggestions.some((item) => item.text === '/compact')).toBe(true)
    })

    it('returns slash builtins immediately and prefetches remote commands on demand', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSlashCommands: vi.fn(async () => ({
                success: true,
                commands: [{ name: 'custom', source: 'user', description: 'Custom command' }]
            }))
        }

        const suggestions = await getSlashCommandSuggestions({
            agentType: 'codex',
            api: api as never,
            query: '/',
            queryClient,
            sessionId: 'session-1'
        })

        expect(suggestions.some((item) => item.text === '/review')).toBe(true)
        await waitFor(() => {
            expect(api.getSlashCommands).toHaveBeenCalledTimes(1)
        })
    })

    it('reuses cached slash command data for filtered suggestions', async () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.slashCommands('session-1'), {
            success: true,
            commands: [{ name: 'custom', source: 'user', description: 'Custom command' }]
        })

        const suggestions = await getSlashCommandSuggestions({
            agentType: 'codex',
            api: null,
            query: '/cus',
            queryClient,
            sessionId: 'session-1'
        })

        expect(suggestions).toEqual([
            expect.objectContaining({
                text: '/custom',
                description: 'Custom command',
                source: 'user'
            })
        ])
    })

    it('reuses cached skill data and keeps recent skills first for an empty skill query', async () => {
        const queryClient = createQueryClient()
        localStorage.setItem('viby-recent-skills', JSON.stringify({
            deploy: 2,
            build: 1
        }))
        queryClient.setQueryData(queryKeys.skills('session-1'), {
            success: true,
            skills: [
                { name: 'build', description: 'Build skill' },
                { name: 'deploy', description: 'Deploy skill' }
            ]
        })

        const suggestions = await getSkillSuggestions({
            api: null,
            query: '$',
            queryClient,
            sessionId: 'session-1'
        })

        expect(suggestions.map((item) => item.text)).toEqual(['$deploy', '$build'])
    })
})
