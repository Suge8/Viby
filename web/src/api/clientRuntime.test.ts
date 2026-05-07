// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ApiClientRequest } from './client'
import { getRuntimeAgentAvailability, resolveAgentLaunchConfig } from './clientRuntime'

describe('clientRuntime', () => {
    it('passes agent launch config cancellation without serializing the signal', async () => {
        const signal = new AbortController().signal
        const request = vi.fn(async (_path: string, init?: RequestInit) => {
            expect(_path).toBe('/api/runtime/agent-launch-config')
            expect(init?.signal).toBe(signal)
            expect(JSON.parse(String(init?.body))).toEqual({ agent: 'codex', directory: '/tmp/project' })
            return { type: 'error', message: 'expected test stop' }
        }) as ApiClientRequest

        await resolveAgentLaunchConfig(request, { agent: 'codex', directory: '/tmp/project', signal })
    })

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
