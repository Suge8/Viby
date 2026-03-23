import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSessionTargetResolver } from '@/hooks/useSessionTargetResolver'

describe('useSessionTargetResolver', () => {
    it('resumes an inactive session once and reuses the resolved target', async () => {
        const api = {
            resumeSession: vi.fn().mockResolvedValue('session-2')
        }
        const onResolved = vi.fn()
        const onError = vi.fn()

        const { result, rerender } = renderHook((session: { id: string; active: boolean }) => useSessionTargetResolver({
            api: api as never,
            session: session as never,
            onResolved,
            onError,
        }), {
            initialProps: { id: 'session-1', active: false }
        })

        await expect(result.current('session-1')).resolves.toBe('session-2')
        await expect(result.current('session-1')).resolves.toBe('session-2')

        expect(api.resumeSession).toHaveBeenCalledTimes(1)
        expect(onResolved).toHaveBeenCalledWith('session-1', 'session-2')
        expect(onError).not.toHaveBeenCalled()

        rerender({ id: 'session-2', active: true })

        await expect(result.current('session-2')).resolves.toBe('session-2')
        expect(api.resumeSession).toHaveBeenCalledTimes(1)
    })

    it('dedupes concurrent resume requests while a resume is in flight', async () => {
        let resolveResume: ((sessionId: string) => void) | null = null
        const api = {
            resumeSession: vi.fn().mockImplementation(() => new Promise<string>((resolve) => {
                resolveResume = resolve
            }))
        }
        const onResolved = vi.fn()

        const { result } = renderHook(() => useSessionTargetResolver({
            api: api as never,
            session: { id: 'session-1', active: false } as never,
            onResolved,
            onError: vi.fn(),
        }))

        let pendingResults: string[] | null = null
        await act(async () => {
            const first = result.current('session-1')
            const second = result.current('session-1')

            expect(api.resumeSession).toHaveBeenCalledTimes(1)

            resolveResume?.('session-2')
            pendingResults = await Promise.all([first, second])
        })

        expect(pendingResults).toEqual(['session-2', 'session-2'])
        expect(onResolved).toHaveBeenCalledTimes(1)
    })
})
