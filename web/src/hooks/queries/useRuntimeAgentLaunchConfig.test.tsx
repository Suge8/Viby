import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import type { AgentFlavor, RuntimeCapabilityResponse } from '@/types/api'
import { useRuntimeAgentLaunchConfig } from './useRuntimeAgentLaunchConfig'

function createCapability(agent: AgentFlavor, errorCode?: string): RuntimeCapabilityResponse {
    return {
        snapshot: {
            machineId: 'machine-1',
            directory: '/repo',
            detectedAt: 1,
            expiresAt: 2,
            refreshing: false,
            error: null,
            agents: [
                {
                    driver: agent,
                    availability: {
                        driver: agent,
                        value: null,
                        detectedAt: null,
                        expiresAt: null,
                        refreshing: false,
                        error: null,
                    },
                    launchConfig: {
                        agent,
                        config: errorCode
                            ? null
                            : {
                                  agent,
                                  defaultModel: null,
                                  defaultModelReasoningEffort: null,
                                  availableModels: [],
                              },
                        detectedAt: 1,
                        expiresAt: 2,
                        refreshing: false,
                        error: errorCode ? { code: errorCode as 'auth_missing', detectedAt: 1 } : null,
                    },
                },
            ],
        },
    }
}

function createApi(): Pick<ApiClient, 'getRuntimeCapabilities'> {
    return {
        getRuntimeCapabilities: vi.fn(async ({ drivers }) => createCapability(drivers?.[0] ?? 'claude')),
    }
}

function createWrapper(): (props: PropsWithChildren) => React.JSX.Element {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return (
            <I18nProvider>
                <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
            </I18nProvider>
        )
    }
}

describe('useRuntimeAgentLaunchConfig', () => {
    it('caches agent-global config by agent', async () => {
        const api = createApi()
        const { rerender } = renderHook(
            ({ directory }) =>
                useRuntimeAgentLaunchConfig({ api: api as ApiClient, agent: 'copilot', directory, t: (key) => key }),
            { initialProps: { directory: '/repo-a' }, wrapper: createWrapper() }
        )

        await waitFor(() => expect(api.getRuntimeCapabilities).toHaveBeenCalledTimes(1))
        rerender({ directory: '/repo-b' })
        await waitFor(() => expect(api.getRuntimeCapabilities).toHaveBeenCalledTimes(1))
    })

    it('keeps project-aware launch config directory-scoped', async () => {
        const api = createApi()
        const { rerender } = renderHook(
            ({ directory }) =>
                useRuntimeAgentLaunchConfig({ api: api as ApiClient, agent: 'codex', directory, t: (key) => key }),
            { initialProps: { directory: '/repo-a' }, wrapper: createWrapper() }
        )

        await waitFor(() => expect(api.getRuntimeCapabilities).toHaveBeenCalledTimes(1))
        rerender({ directory: '/repo-b' })
        await waitFor(() => expect(api.getRuntimeCapabilities).toHaveBeenCalledTimes(2))
    })

    it('maps runtime-owned config errors without raw CLI passthrough', async () => {
        const api = {
            getRuntimeCapabilities: vi.fn(async () => createCapability('pi', 'auth_missing')),
        }
        const { result } = renderHook(
            () =>
                useRuntimeAgentLaunchConfig({
                    api: api as unknown as ApiClient,
                    agent: 'pi',
                    directory: '/repo',
                    t: (key) => key,
                }),
            { wrapper: createWrapper() }
        )

        await waitFor(() => expect(result.current.error).toBe('runtimeCapability.error.auth_missing'))
    })

    it('forces Hub refresh through the same runtime capability query owner', async () => {
        const api = createApi()
        const { result } = renderHook(
            () =>
                useRuntimeAgentLaunchConfig({
                    api: api as ApiClient,
                    agent: 'claude',
                    directory: '/repo',
                    t: (key) => key,
                }),
            { wrapper: createWrapper() }
        )

        await waitFor(() => expect(api.getRuntimeCapabilities).toHaveBeenCalledTimes(1))
        await act(async () => {
            await result.current.refetch()
        })

        expect(api.getRuntimeCapabilities).toHaveBeenLastCalledWith({
            drivers: ['claude'],
            directory: '/repo',
            depth: 'launch_config',
            forceRefresh: true,
            signal: expect.any(AbortSignal),
        })
    })

    it('passes query cancellation to the API owner', async () => {
        const api = createApi()
        renderHook(
            () =>
                useRuntimeAgentLaunchConfig({
                    api: api as ApiClient,
                    agent: 'claude',
                    directory: '/repo',
                    t: (key) => key,
                }),
            { wrapper: createWrapper() }
        )

        await waitFor(() => {
            expect(api.getRuntimeCapabilities).toHaveBeenCalledWith({
                drivers: ['claude'],
                directory: '/repo',
                depth: 'launch_config',
                signal: expect.any(AbortSignal),
            })
        })
    })
})
