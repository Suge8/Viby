import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishRuntimeUpdateReady, resetPendingRuntimeUpdate } from '@/lib/runtimeUpdateChannel'
import { useRuntimeUpdateState } from '@/hooks/useRuntimeUpdateState'

describe('useRuntimeUpdateState', () => {
    afterEach(() => {
        resetPendingRuntimeUpdate()
        delete window.__vibyRealtimeTrace
    })

    it('tracks pending runtime updates and clears them after apply succeeds', async () => {
        const apply = vi.fn(async () => undefined)
        const { result } = renderHook(() => useRuntimeUpdateState())

        act(() => {
            publishRuntimeUpdateReady(apply)
        })

        await waitFor(() => {
            expect(result.current.snapshot).not.toBeNull()
        })

        await act(async () => {
            await expect(result.current.applyUpdate()).resolves.toBe(true)
        })

        expect(apply).toHaveBeenCalledTimes(1)
        expect(result.current.snapshot).toBeNull()
    })
})
