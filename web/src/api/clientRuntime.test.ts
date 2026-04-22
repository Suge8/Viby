// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ApiClientRequest } from './client'
import { getRuntimeAgentAvailability } from './clientRuntime'

describe('clientRuntime', () => {
    it('includes forceRefresh in the runtime agent availability query when requested', async () => {
        const request = vi.fn(async (path: string) => {
            expect(path).toBe('/api/runtime/agent-availability?directory=%2Ftmp%2Fproject&forceRefresh=true')
            return { agents: [] }
        }) as ApiClientRequest

        await expect(
            getRuntimeAgentAvailability(request, {
                directory: '/tmp/project',
                forceRefresh: true,
            })
        ).resolves.toEqual({ agents: [] })
    })
})
