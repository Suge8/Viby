import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { useCommandCapabilityRefreshKey } from '@/routes/sessions/SessionAutocompleteCapabilities'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })
}

describe('SessionAutocompleteCapabilities', () => {
    it('bumps the refresh key when command capabilities are invalidated', async () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData(queryKeys.commandCapabilities('session-1'), {
            success: true,
            revision: 'rev-1',
            capabilities: [],
        })

        const { result } = renderHook(() =>
            useCommandCapabilityRefreshKey({
                queryClient,
                sessionId: 'session-1',
            })
        )

        expect(result.current).toBe(0)

        await queryClient.invalidateQueries({
            queryKey: queryKeys.commandCapabilities('session-1'),
        })

        await waitFor(() => {
            expect(result.current).toBe(1)
        })
    })
})
