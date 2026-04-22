import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { useRuntimeAgentAvailability } from './useRuntimeAgentAvailability'

function createWrapper(): (props: PropsWithChildren) => React.JSX.Element {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
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

describe('useRuntimeAgentAvailability', () => {
    it('uses forceRefresh only for explicit manual refreshes', async () => {
        const api = {
            getRuntimeAgentAvailability: vi
                .fn()
                .mockResolvedValueOnce({
                    agents: [{ driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 }],
                })
                .mockResolvedValueOnce({
                    agents: [{ driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 2 }],
                }),
        } as unknown as ApiClient

        const { result } = renderHook(() => useRuntimeAgentAvailability(api, '/tmp/project'), {
            wrapper: createWrapper(),
        })

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(api.getRuntimeAgentAvailability).toHaveBeenNthCalledWith(1, {
            directory: '/tmp/project',
            signal: expect.any(AbortSignal),
        })

        await result.current.refetch()

        expect(api.getRuntimeAgentAvailability).toHaveBeenNthCalledWith(2, {
            directory: '/tmp/project',
            forceRefresh: true,
            signal: expect.any(AbortSignal),
        })
    })

    it('surfaces manual refresh failures through the same query error owner', async () => {
        const api = {
            getRuntimeAgentAvailability: vi
                .fn()
                .mockResolvedValueOnce({
                    agents: [{ driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 }],
                })
                .mockRejectedValueOnce(new Error('refresh failed')),
        } as unknown as ApiClient

        const { result } = renderHook(() => useRuntimeAgentAvailability(api, '/tmp/project'), {
            wrapper: createWrapper(),
        })

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        await result.current.refetch()

        await waitFor(() => {
            expect(result.current.error).toBe('Could not load the local runtime right now. Please try again.')
        })
    })
})
