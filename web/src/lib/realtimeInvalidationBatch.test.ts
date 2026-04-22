import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRealtimeInvalidationBatch } from '@/lib/realtimeInvalidationBatch'

describe('realtimeInvalidationBatch', () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

    beforeEach(() => {
        vi.useFakeTimers()
        globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            return setTimeout(() => callback(Date.now()), 0) as unknown as number
        }) as typeof requestAnimationFrame
        globalThis.cancelAnimationFrame = ((id: number) => {
            clearTimeout(id)
        }) as typeof cancelAnimationFrame
    })

    afterEach(() => {
        vi.useRealTimers()
        globalThis.requestAnimationFrame = originalRequestAnimationFrame
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    })

    it('marks command capability queries stale without forcing a background refetch', async () => {
        const invalidateQueries = vi.fn(async () => undefined)
        const batch = createRealtimeInvalidationBatch({
            queryClient: {
                invalidateQueries,
            } as never,
            onError: vi.fn(),
        })

        batch.queueCommandCapabilities('session-1')
        await vi.runAllTimersAsync()

        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['command-capabilities', 'session-1'],
            refetchType: 'none',
        })
    })
})
