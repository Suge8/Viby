import { describe, expect, it } from 'bun:test'
import type { AgentAvailabilityResponse, ResolveAgentLaunchConfigResponse, SyncEvent } from '@viby/protocol'
import { RuntimeCapabilityCache } from './runtimeCapabilityCache'

function ready(driver: AgentAvailabilityResponse['agents'][number]['driver'], detectedAt = Date.now()) {
    return { driver, status: 'ready' as const, resolution: 'none' as const, code: 'ready' as const, detectedAt }
}

describe('RuntimeCapabilityCache', () => {
    it('dedupes same-key concurrent availability refreshes', async () => {
        let calls = 0
        let release!: () => void
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async (_machineId, request) => {
                    calls += 1
                    await pending
                    return { agents: [ready(request.drivers?.[0] ?? 'claude')] }
                },
                resolveAgentLaunchConfig: async () => ({ type: 'error', code: 'unknown', message: 'unused' }),
            },
            { emit: () => undefined }
        )

        const first = cache.getAgentAvailability('machine-1', {
            directory: '/repo',
            drivers: ['claude'],
            forceRefresh: true,
        })
        const second = cache.getAgentAvailability('machine-1', {
            directory: '/repo',
            drivers: ['claude'],
            forceRefresh: true,
        })
        release()

        await expect(first).resolves.toEqual({ agents: [expect.objectContaining({ driver: 'claude' })] })
        await expect(second).resolves.toEqual({ agents: [expect.objectContaining({ driver: 'claude' })] })
        expect(calls).toBe(1)
    })

    it('queues force refresh behind non-force pending refreshes', async () => {
        const calls: Array<boolean | undefined> = []
        let releaseFirst!: () => void
        const firstPending = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async (_machineId, request) => {
                    calls.push(request.forceRefresh)
                    if (calls.length === 1) await firstPending
                    return { agents: [ready(request.drivers?.[0] ?? 'claude')] }
                },
                resolveAgentLaunchConfig: async () => ({ type: 'error', code: 'unknown', message: 'unused' }),
            },
            { emit: () => undefined }
        )

        cache.getSnapshot('machine-1', { directory: '/repo', drivers: ['claude'], depth: 'availability' })
        const forced = cache.getAgentAvailability('machine-1', {
            directory: '/repo',
            drivers: ['claude'],
            forceRefresh: true,
        })
        releaseFirst()
        await forced

        expect(calls).toEqual([false, true])
    })

    it('returns stale snapshot immediately while revalidating', async () => {
        let detectedAt = 1
        let release!: () => void
        let block = false
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async () => {
                    if (block) await pending
                    return { agents: [ready('claude', detectedAt)] }
                },
                resolveAgentLaunchConfig: async () => ({ type: 'error', code: 'unknown', message: 'unused' }),
            },
            { emit: () => undefined }
        )
        await cache.getAgentAvailability('machine-1', { directory: '/repo', drivers: ['claude'], forceRefresh: true })

        block = true
        detectedAt = 2
        const snapshot = cache.getSnapshot('machine-1', {
            directory: '/repo',
            drivers: ['claude'],
            forceRefresh: true,
            depth: 'availability',
        })

        expect(snapshot.agents.find((agent) => agent.driver === 'claude')?.availability).toMatchObject({
            value: expect.objectContaining({ detectedAt: 1 }),
            refreshing: true,
        })
        release()
    })

    it('keeps per-agent refresh independent across directories and providers', async () => {
        const events: SyncEvent[] = []
        const calls: string[] = []
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async (_machineId, request) => {
                    const driver = request.drivers?.[0] ?? 'claude'
                    calls.push(`${request.directory}:${driver}`)
                    return { agents: [ready(driver)] }
                },
                resolveAgentLaunchConfig: async (_machineId, request) => {
                    if (request.agent === 'pi') await new Promise((resolve) => setTimeout(resolve, 10))
                    return {
                        type: 'success',
                        config: {
                            agent: request.agent,
                            availableModels: [{ id: 'model-1', label: 'Model 1', supportedThinkingLevels: ['high'] }],
                        },
                    } satisfies ResolveAgentLaunchConfigResponse
                },
            },
            { emit: (event) => events.push(event) }
        )

        await Promise.all([
            cache.getAgentAvailability('machine-1', { directory: '/repo-a', drivers: ['claude'], forceRefresh: true }),
            cache.getAgentAvailability('machine-1', { directory: '/repo-b', drivers: ['claude'], forceRefresh: true }),
            cache.resolveAgentLaunchConfig('machine-1', { directory: '/repo-a', agent: 'claude' }),
            cache.resolveAgentLaunchConfig('machine-1', { directory: '/repo-a', agent: 'pi' }),
        ])

        expect(calls).toEqual(['/repo-a:claude', '/repo-b:claude'])
        expect(
            events.some((event) => event.type === 'runtime-capability-updated' && event.drivers?.[0] === 'claude')
        ).toBe(true)
    })

    it('materializes an unavailable agent when availability RPC fails without stale data', async () => {
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async () => {
                    throw new Error('socket down')
                },
                resolveAgentLaunchConfig: async () => ({ type: 'error', code: 'unknown', message: 'unused' }),
            },
            { emit: () => undefined }
        )

        await expect(
            cache.getAgentAvailability('machine-1', { directory: '/repo', drivers: ['claude'], forceRefresh: true })
        ).resolves.toEqual({
            agents: [
                expect.objectContaining({
                    driver: 'claude',
                    status: 'unavailable',
                    code: 'unknown',
                }),
            ],
        })
    })

    it('refreshes expired launch config errors when building agent launch options', async () => {
        let now = 1_000
        let configCalls = 0
        const originalNow = Date.now
        Date.now = () => now
        try {
            const cache = new RuntimeCapabilityCache(
                {
                    listAgentAvailability: async (_machineId, request) => {
                        const driver = request.drivers?.[0] ?? 'claude'
                        return {
                            agents: [
                                driver === 'codex'
                                    ? ready('codex', now)
                                    : {
                                          driver,
                                          status: 'unavailable' as const,
                                          resolution: 'learn_more' as const,
                                          code: 'unknown' as const,
                                          detectedAt: now,
                                      },
                            ],
                        }
                    },
                    resolveAgentLaunchConfig: async (_machineId, request) => {
                        configCalls += 1
                        return configCalls === 1
                            ? { type: 'error', code: 'provider_unavailable', message: 'provider down' }
                            : {
                                  type: 'success',
                                  config: {
                                      agent: request.agent,
                                      availableModels: [
                                          { id: 'gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: ['high'] },
                                      ],
                                  },
                              }
                    },
                },
                { emit: () => undefined }
            )

            const first = await cache.getAgentLaunchOptions('machine-1', { directory: '/repo', refresh: true })
            expect(first.unavailable.codex).toBe('launch_config_error')
            expect(configCalls).toBe(1)

            now += 10_001
            const second = await cache.getAgentLaunchOptions('machine-1', { directory: '/repo' })

            expect(configCalls).toBe(2)
            expect(second.agents).toEqual([
                expect.objectContaining({ agent: 'codex', modelOptions: [{ value: 'gpt-5.4', label: 'GPT-5.4' }] }),
            ])
        } finally {
            Date.now = originalNow
        }
    })

    it('does not resolve launch config for default spawn options outside Pi', async () => {
        let configCalls = 0
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async () => ({ agents: [ready('claude')] }),
                resolveAgentLaunchConfig: async () => {
                    configCalls += 1
                    return { type: 'error', code: 'provider_unavailable', message: 'slow model probe' }
                },
            },
            { emit: () => undefined }
        )

        await expect(cache.validateSpawn('machine-1', { directory: '/repo', agent: 'claude' })).resolves.toEqual({
            ok: true,
        })
        expect(configCalls).toBe(0)
    })

    it('requires Pi launch config before default spawn because Pi startup probes the RPC model state', async () => {
        let configCalls = 0
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async () => ({ agents: [ready('pi')] }),
                resolveAgentLaunchConfig: async () => {
                    configCalls += 1
                    return { type: 'error', code: 'provider_unavailable', message: 'slow model probe' }
                },
            },
            { emit: () => undefined }
        )

        await expect(cache.validateSpawn('machine-1', { directory: '/repo', agent: 'pi' })).resolves.toMatchObject({
            ok: false,
            status: 409,
            body: { code: 'agent_config_unavailable', capabilityErrorCode: 'provider_unavailable' },
        })
        expect(configCalls).toBe(1)
    })

    it('reuses fresh launch config when validating explicit spawn options', async () => {
        let configCalls = 0
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async () => ({ agents: [ready('pi')] }),
                resolveAgentLaunchConfig: async () => {
                    configCalls += 1
                    return {
                        type: 'success',
                        config: {
                            agent: 'pi',
                            availableModels: [{ id: 'openai/gpt-5', label: 'GPT-5', supportedThinkingLevels: ['low'] }],
                        },
                    }
                },
            },
            { emit: () => undefined }
        )

        await cache.resolveAgentLaunchConfig('machine-1', { directory: '/repo', agent: 'pi' })
        await expect(
            cache.validateSpawn('machine-1', { directory: '/repo', agent: 'pi', model: 'openai/gpt-5' })
        ).resolves.toEqual({ ok: true })
        expect(configCalls).toBe(1)
    })

    it('rejects spawn on stale availability or launch config refresh errors', async () => {
        let failAvailability = false
        let failConfig = false
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async () => {
                    if (failAvailability) throw new Error('socket down')
                    return { agents: [ready('pi')] }
                },
                resolveAgentLaunchConfig: async () =>
                    failConfig
                        ? { type: 'error', code: 'auth_missing', message: 'raw provider auth error' }
                        : {
                              type: 'success',
                              config: {
                                  agent: 'pi',
                                  availableModels: [
                                      { id: 'openai/gpt-5', label: 'GPT-5', supportedThinkingLevels: ['low'] },
                                  ],
                              },
                          },
            },
            { emit: () => undefined }
        )

        await expect(cache.validateSpawn('machine-1', { directory: '/repo', agent: 'pi' })).resolves.toEqual({
            ok: true,
        })

        failConfig = true
        await expect(cache.resolveAgentLaunchConfig('machine-1', { directory: '/repo', agent: 'pi' })).resolves.toEqual(
            {
                type: 'error',
                code: 'auth_missing',
                message: 'Agent authentication is missing on this machine',
            }
        )
        await expect(
            cache.validateSpawn('machine-1', { directory: '/repo', agent: 'pi', model: 'openai/gpt-5' })
        ).resolves.toMatchObject({
            ok: false,
            body: { code: 'agent_config_unavailable', capabilityErrorCode: 'auth_missing' },
        })

        failConfig = false
        failAvailability = true
        await expect(cache.validateSpawn('machine-1', { directory: '/repo', agent: 'pi' })).resolves.toMatchObject({
            ok: false,
            body: { code: 'agent_unavailable', capabilityErrorCode: 'rpc_unavailable' },
        })
    })

    it('rejects invalid spawn model and reasoning without raw provider errors', async () => {
        const cache = new RuntimeCapabilityCache(
            {
                listAgentAvailability: async () => ({ agents: [ready('pi')] }),
                resolveAgentLaunchConfig: async () => ({
                    type: 'success',
                    config: {
                        agent: 'pi',
                        availableModels: [{ id: 'openai/gpt-5', label: 'GPT-5', supportedThinkingLevels: ['low'] }],
                    },
                }),
            },
            { emit: () => undefined }
        )

        await expect(
            cache.validateSpawn('machine-1', {
                directory: '/repo',
                agent: 'pi',
                model: 'missing-model',
                modelReasoningEffort: 'high',
            })
        ).resolves.toMatchObject({ ok: false, status: 400, body: { code: 'model_unavailable' } })
    })
})
