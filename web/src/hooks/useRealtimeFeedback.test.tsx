import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeFeedback } from '@/hooks/useRealtimeFeedback'
import type { RealtimeRecoveryRuntimeState } from '@/lib/realtimeRecoveryRuntime'

describe('useRealtimeFeedback', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('maps reconnecting and syncing runtime states to one busy banner', () => {
        let state: RealtimeRecoveryRuntimeState = { status: 'reconnecting' }
        const retry = vi.fn()
        const { result, rerender } = renderHook(() => useRealtimeFeedback(state, retry))

        expect(result.current.banner).toEqual({ kind: 'busy' })

        state = { status: 'syncing' }
        rerender()

        expect(result.current.banner).toEqual({ kind: 'busy' })
    })

    it('maps failed runtime state to retry banner', () => {
        const retry = vi.fn()
        const { result } = renderHook(() =>
            useRealtimeFeedback(
                { status: 'failed', failure: { trigger: 'foreground', error: new Error('failed') } },
                retry
            )
        )

        expect(result.current.banner.kind).toBe('failed')
        if (result.current.banner.kind === 'failed') result.current.banner.retry()
        expect(retry).toHaveBeenCalledTimes(1)
    })

    it('shows failed immediately over an active restoring banner', () => {
        let state: RealtimeRecoveryRuntimeState = { status: 'idle' }
        const retry = vi.fn()
        const { result, rerender } = renderHook(() => useRealtimeFeedback(state, retry))

        act(() => {
            result.current.announceRecovery('page-restored')
        })
        state = { status: 'failed', failure: { trigger: 'foreground', error: new Error('failed') } }
        rerender()

        expect(result.current.banner.kind).toBe('failed')
        if (result.current.banner.kind === 'failed') result.current.banner.retry()
        expect(retry).toHaveBeenCalledTimes(1)
    })

    it('shows a short restoring state for boot recovery notices', async () => {
        const { result } = renderHook(() => useRealtimeFeedback({ status: 'idle' }, vi.fn()))

        act(() => {
            result.current.announceRecovery('page-discarded')
        })

        expect(result.current.banner).toEqual({ kind: 'restoring', reason: 'page-discarded' })

        await act(async () => {
            vi.advanceTimersByTime(1_600)
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
    })

    it('keeps restoring over runtime busy until the recovery window ends', async () => {
        let state: RealtimeRecoveryRuntimeState = { status: 'idle' }
        const { result, rerender } = renderHook(() => useRealtimeFeedback(state, vi.fn()))

        act(() => {
            result.current.announceRecovery('page-restored')
        })
        state = { status: 'syncing' }
        rerender()

        expect(result.current.banner).toEqual({ kind: 'restoring', reason: 'page-restored' })

        await act(async () => {
            vi.advanceTimersByTime(1_600)
        })

        expect(result.current.banner).toEqual({ kind: 'busy' })
    })
})
