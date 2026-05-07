import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { useRuntimeAgentAvailability } from './useRuntimeAgentAvailability'

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

function capability(detectedAt: number, refreshing = false) {
    return {
        snapshot: {
            machineId: 'machine-1',
            directory: '/tmp/project',
            detectedAt,
            expiresAt: detectedAt + 1,
            refreshing,
            error: null,
            agents: [
                {
                    driver: 'claude',
                    availability: {
                        driver: 'claude',
                        value: { driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt },
                        detectedAt,
                        expiresAt: detectedAt + 1,
                        refreshing,
                        error: null,
                    },
                    launchConfig: {
                        agent: 'claude',
                        config: null,
                        detectedAt: null,
                        expiresAt: null,
                        refreshing: false,
                        error: null,
                    },
                },
            ],
        },
    }
}

describe('useRuntimeAgentAvailability', () => {
    it('uses forceRefresh only for explicit manual refreshes', async () => {
        const api = {
            getRuntimeCapabilities: vi.fn().mockResolvedValueOnce(capability(1)).mockResolvedValueOnce(capability(2)),
        } as unknown as ApiClient

        const { result } = renderHook(() => useRuntimeAgentAvailability(api, '/tmp/project'), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(api.getRuntimeCapabilities).toHaveBeenNthCalledWith(1, {
            directory: '/tmp/project',
            depth: 'availability',
            signal: expect.any(AbortSignal),
        })

        await result.current.refetch()

        expect(api.getRuntimeCapabilities).toHaveBeenNthCalledWith(2, {
            directory: '/tmp/project',
            forceRefresh: true,
            depth: 'availability',
            signal: expect.any(AbortSignal),
        })
    })

    it('surfaces manual refresh failures through the same query error owner', async () => {
        const api = {
            getRuntimeCapabilities: vi
                .fn()
                .mockResolvedValueOnce(capability(1))
                .mockRejectedValueOnce(new Error('refresh failed')),
        } as unknown as ApiClient

        const { result } = renderHook(() => useRuntimeAgentAvailability(api, '/tmp/project'), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        await result.current.refetch()

        await waitFor(() => {
            expect(result.current.error).toBe('Could not load the local runtime right now. Please try again.')
        })
    })
})
