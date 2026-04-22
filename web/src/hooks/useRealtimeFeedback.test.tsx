import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeFeedback } from '@/hooks/useRealtimeFeedback'

describe('useRealtimeFeedback', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        delete window.__vibyRealtimeTrace
    })

    it('shows one busy banner only after reconnect work stays visible past the debounce', async () => {
        const { result } = renderHook(() => useRealtimeFeedback())

        act(() => {
            result.current.handleConnect({ initial: true, recovered: false })
            result.current.handleDisconnect('closed')
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })

        let resolveTask: (() => void) | null = null
        const task = new Promise<void>((resolve) => {
            resolveTask = resolve
        })

        act(() => {
            result.current.handleConnect({ initial: false, recovered: false })
            result.current.runCatchupSync(task)
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })

        await act(async () => {
            vi.advanceTimersByTime(450)
        })

        expect(result.current.banner).toEqual({ kind: 'busy' })

        await act(async () => {
            resolveTask?.()
            await task
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
        expect(window.__vibyRealtimeTrace?.map((entry) => entry.type)).toEqual([
            'connect',
            'disconnect',
            'connect',
            'sync_start',
            'sync_end',
        ])
    })

    it('keeps short reconnects hidden when recovery finishes before the busy debounce', async () => {
        const { result } = renderHook(() => useRealtimeFeedback())

        act(() => {
            result.current.handleConnect({ initial: true, recovered: false })
            result.current.handleDisconnect('heartbeat-timeout')
            result.current.handleConnect({ initial: false, recovered: true })
        })

        await act(async () => {
            vi.advanceTimersByTime(450)
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
    })

    it('shows a short restoring state for boot recovery notices', async () => {
        const { result } = renderHook(() => useRealtimeFeedback())

        act(() => {
            result.current.announceRecovery('page-discarded')
        })

        expect(result.current.banner).toEqual({ kind: 'restoring', reason: 'page-discarded' })

        await act(async () => {
            vi.advanceTimersByTime(1_600)
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
        expect(window.__vibyRealtimeTrace?.map((entry) => entry.type)).toEqual(['restore'])
    })

    it('keeps the restoring notice visible when the socket reconnects immediately', async () => {
        const { result } = renderHook(() => useRealtimeFeedback())

        act(() => {
            result.current.announceRecovery('page-restored')
            result.current.handleConnect({ initial: false, recovered: true })
        })

        expect(result.current.banner).toEqual({ kind: 'restoring', reason: 'page-restored' })

        await act(async () => {
            vi.advanceTimersByTime(1_600)
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
        expect(window.__vibyRealtimeTrace?.map((entry) => entry.type)).toEqual(['restore', 'connect'])
    })

    it('does not get stuck in restoring when reconnect work continues past the recovery window', async () => {
        const { result } = renderHook(() => useRealtimeFeedback())

        let resolveTask: (() => void) | null = null
        const task = new Promise<void>((resolve) => {
            resolveTask = resolve
        })

        act(() => {
            result.current.announceRecovery('page-restored')
            result.current.handleDisconnect('closed')
            result.current.runCatchupSync(task)
        })

        await act(async () => {
            vi.advanceTimersByTime(450)
        })

        expect(result.current.banner).toEqual({ kind: 'restoring', reason: 'page-restored' })

        await act(async () => {
            vi.advanceTimersByTime(1_150)
        })

        expect(result.current.banner).toEqual({ kind: 'busy' })

        await act(async () => {
            resolveTask?.()
            await task
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
    })

    it('keeps one busy banner visible until overlapping sync tasks all finish', async () => {
        const { result } = renderHook(() => useRealtimeFeedback())

        let resolveFirstTask: (() => void) | null = null
        const firstTask = new Promise<void>((resolve) => {
            resolveFirstTask = resolve
        })
        let resolveSecondTask: (() => void) | null = null
        const secondTask = new Promise<void>((resolve) => {
            resolveSecondTask = resolve
        })

        act(() => {
            result.current.handleConnect({ initial: true, recovered: false })
            result.current.handleDisconnect('closed')
            result.current.runCatchupSync(firstTask)
            result.current.runCatchupSync(secondTask)
        })

        await act(async () => {
            vi.advanceTimersByTime(450)
        })

        expect(result.current.banner).toEqual({ kind: 'busy' })

        await act(async () => {
            resolveFirstTask?.()
            await firstTask
        })

        expect(result.current.banner).toEqual({ kind: 'busy' })

        await act(async () => {
            resolveSecondTask?.()
            await secondTask
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
    })

    it('keeps silent catch-up sync hidden while still tracing the work', async () => {
        const { result } = renderHook(() => useRealtimeFeedback())

        let resolveTask: (() => void) | null = null
        const task = new Promise<void>((resolve) => {
            resolveTask = resolve
        })

        act(() => {
            result.current.runCatchupSync(task, { silent: true })
        })

        await act(async () => {
            vi.advanceTimersByTime(450)
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })

        await act(async () => {
            resolveTask?.()
            await task
        })

        expect(result.current.banner).toEqual({ kind: 'hidden' })
        expect(window.__vibyRealtimeTrace?.map((entry) => entry.type)).toEqual(['sync_start', 'sync_end'])
        expect(window.__vibyRealtimeTrace?.[0]?.details).toEqual({ silent: true })
    })
})
