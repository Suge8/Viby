// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ApiClientRequest } from './client'
import {
    getAgentConfig,
    getAgentLaunchOptions,
    getRuntimeCapabilities,
    openAgentConfig,
    restoreAgentConfig,
    saveAgentConfig,
} from './clientRuntime'

describe('clientRuntime', () => {
    it('passes agent launch options cancellation without serializing the signal', async () => {
        const signal = new AbortController().signal
        const request = vi.fn(async (_path: string, init?: RequestInit) => {
            expect(_path).toBe('/api/runtime/agent-launch-options?directory=%2Ftmp%2Fproject&refresh=1')
            expect(init?.signal).toBe(signal)
            return { projection: { agents: [], unavailable: {} } }
        }) as ApiClientRequest

        await getAgentLaunchOptions(request, { directory: '/tmp/project', refresh: true, signal })
    })

    it('includes depth and drivers in the runtime capability query when requested', async () => {
        const request = vi.fn(async (path: string) => {
            expect(path).toBe(
                '/api/runtime/capabilities?directory=%2Ftmp%2Fproject&forceRefresh=true&drivers=claude%2Cpi&depth=launch_config'
            )
            return { snapshot: { machineId: 'machine-1', directory: '/tmp/project', agents: [] } }
        }) as ApiClientRequest

        await getRuntimeCapabilities(request, {
            directory: '/tmp/project',
            forceRefresh: true,
            drivers: ['claude', 'pi'],
            depth: 'launch_config',
        })
    })

    it('uses the runtime agent config endpoints for load, save, restore, and open', async () => {
        const request = vi.fn(async (path: string, init?: RequestInit) => {
            if (!init) {
                expect(path).toBe('/api/runtime/agent-config')
                return { agents: [] }
            }
            if (init.method === 'PUT') {
                expect(path).toBe('/api/runtime/agent-config/codex')
                expect(JSON.parse(String(init.body))).toEqual({ driver: 'codex', values: { 'codex.model': 'gpt-5.4' } })
            } else if (path.endsWith('/open')) {
                expect(path).toBe('/api/runtime/agent-config/codex/open')
                expect(JSON.parse(String(init.body))).toEqual({ driver: 'codex' })
                return { ok: true, path: '/tmp/config.toml' }
            } else {
                expect(path).toBe('/api/runtime/agent-config/codex/restore')
                expect(JSON.parse(String(init.body))).toEqual({ driver: 'codex', backupPath: '/tmp/config.bak' })
            }
            return { agent: { driver: 'codex', path: '/tmp/config.toml', exists: true, values: {} } }
        }) as ApiClientRequest

        await expect(getAgentConfig(request)).resolves.toEqual({ agents: [] })
        await expect(
            saveAgentConfig(request, { driver: 'codex', values: { 'codex.model': 'gpt-5.4' } })
        ).resolves.toEqual({ agent: { driver: 'codex', path: '/tmp/config.toml', exists: true, values: {} } })
        await expect(restoreAgentConfig(request, { driver: 'codex', backupPath: '/tmp/config.bak' })).resolves.toEqual({
            agent: { driver: 'codex', path: '/tmp/config.toml', exists: true, values: {} },
        })
        await expect(openAgentConfig(request, { driver: 'codex' })).resolves.toEqual({
            ok: true,
            path: '/tmp/config.toml',
        })
    })
})
