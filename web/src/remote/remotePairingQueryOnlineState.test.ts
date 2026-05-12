import { onlineManager, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pauseRemotePairingQueries, resumeRemotePairingQueries } from './remotePairingQueryOnlineState'

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
}

describe('remotePairingQueryOnlineState', () => {
    afterEach(() => {
        onlineManager.setOnline(true)
    })

    it('pauses remote queries and clears sticky query errors during retained reconnect', async () => {
        const queryClient = createQueryClient()
        await expect(
            queryClient.fetchQuery({
                queryKey: ['remote-broken'],
                queryFn: async () => {
                    throw new Error('remotePairing.error.peerRequestFailed')
                },
            })
        ).rejects.toThrow('remotePairing.error.peerRequestFailed')

        await queryClient.fetchQuery({ queryKey: ['remote-retained'], queryFn: async () => 'retained' })
        await expect(
            queryClient.fetchQuery({
                queryKey: ['remote-retained'],
                staleTime: 0,
                queryFn: async () => {
                    throw new Error('remotePairing.error.peerRequestFailed')
                },
            })
        ).rejects.toThrow('remotePairing.error.peerRequestFailed')

        expect(queryClient.getQueryState(['remote-broken'])?.status).toBe('error')
        expect(queryClient.getQueryState(['remote-retained'])?.status).toBe('error')

        pauseRemotePairingQueries(queryClient)

        await vi.waitFor(() => {
            expect(queryClient.getQueryState(['remote-broken'])?.status).toBe('pending')
        })
        expect(queryClient.getQueryState(['remote-retained'])?.status).toBe('success')
        expect(queryClient.getQueryData(['remote-retained'])).toBe('retained')
        expect(onlineManager.isOnline()).toBe(false)
    })

    it('resumes online state and invalidates once after a retained reconnect recovers', async () => {
        const queryClient = createQueryClient()
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        onlineManager.setOnline(false)
        resumeRemotePairingQueries(queryClient, { refetch: true })

        expect(onlineManager.isOnline()).toBe(true)
        expect(invalidate).toHaveBeenCalledTimes(1)
    })
})
