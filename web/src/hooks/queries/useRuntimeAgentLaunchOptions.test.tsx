import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { useRuntimeAgentLaunchOptions } from './useRuntimeAgentLaunchOptions'

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

describe('useRuntimeAgentLaunchOptions', () => {
    it('reloads launch options per directory and exposes unavailable reasons', async () => {
        const api = {
            getAgentLaunchOptions: vi.fn(async (input: { directory?: string }) => ({
                projection:
                    input.directory === '/repo-a'
                        ? {
                              agents: [
                                  {
                                      agent: 'codex' as const,
                                      modelOptions: [{ value: 'gpt-5.4', label: 'GPT-5.4' }],
                                      reasoningOptionsByModel: { 'gpt-5.4': [] },
                                  },
                              ],
                              unavailable: {},
                          }
                        : { agents: [], unavailable: { codex: 'launch_config_error' as const } },
            })),
        } as unknown as ApiClient

        const { result, rerender } = renderHook(({ directory }) => useRuntimeAgentLaunchOptions(api, directory), {
            initialProps: { directory: '/repo-a' },
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.projection.agents[0]?.agent).toBe('codex'))

        rerender({ directory: '/repo-b' })

        await waitFor(() => expect(result.current.projection.unavailable.codex).toBe('launch_config_error'))
        expect(api.getAgentLaunchOptions).toHaveBeenNthCalledWith(1, {
            directory: '/repo-a',
            signal: expect.any(AbortSignal),
        })
        expect(api.getAgentLaunchOptions).toHaveBeenNthCalledWith(2, {
            directory: '/repo-b',
            signal: expect.any(AbortSignal),
        })
    })
})
