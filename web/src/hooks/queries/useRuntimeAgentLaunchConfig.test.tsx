import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { useRuntimeAgentLaunchConfig } from './useRuntimeAgentLaunchConfig'

function createApi(): Pick<ApiClient, 'resolveAgentLaunchConfig'> {
    return {
        resolveAgentLaunchConfig: vi.fn(async ({ agent }) => ({
            type: 'success' as const,
            config: {
                agent,
                defaultModel: null,
                defaultModelReasoningEffort: null,
                availableModels: [],
            },
        })),
    }
}

function createWrapper(): (props: PropsWithChildren) => React.JSX.Element {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    })

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

        await waitFor(() => expect(api.resolveAgentLaunchConfig).toHaveBeenCalledTimes(1))
        rerender({ directory: '/repo-b' })
        await waitFor(() => expect(api.resolveAgentLaunchConfig).toHaveBeenCalledTimes(1))
    })

    it('keeps project-aware launch config directory-scoped', async () => {
        const api = createApi()
        const { rerender } = renderHook(
            ({ directory }) =>
                useRuntimeAgentLaunchConfig({ api: api as ApiClient, agent: 'codex', directory, t: (key) => key }),
            { initialProps: { directory: '/repo-a' }, wrapper: createWrapper() }
        )

        await waitFor(() => expect(api.resolveAgentLaunchConfig).toHaveBeenCalledTimes(1))
        rerender({ directory: '/repo-b' })
        await waitFor(() => expect(api.resolveAgentLaunchConfig).toHaveBeenCalledTimes(2))
    })

    it('surfaces actionable local runtime errors', async () => {
        const api = {
            resolveAgentLaunchConfig: vi.fn(async () => ({ type: 'error' as const, message: 'Pi auth missing' })),
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

        await waitFor(() => expect(result.current.error).toBe('Pi auth missing'))
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
            {
                wrapper: createWrapper(),
            }
        )

        await waitFor(() => {
            expect(api.resolveAgentLaunchConfig).toHaveBeenCalledWith({
                agent: 'claude',
                directory: '/repo',
                signal: expect.any(AbortSignal),
            })
        })
    })
})
