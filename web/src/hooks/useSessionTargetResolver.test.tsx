import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSessionTargetResolver } from '@/hooks/useSessionTargetResolver'

describe('useSessionTargetResolver', () => {
    it('resumes an inactive session once and reuses the in-flight ready promise', async () => {
        const resumedSession = {
            id: 'session-1',
            active: true,
            metadata: {
                flavor: 'codex',
                codexSessionId: 'thread-1'
            }
        }
        const api = {
            resumeSession: vi.fn().mockResolvedValue(resumedSession)
        }
        const onReady = vi.fn()
        const onError = vi.fn()

        const { result, rerender } = renderHook((session: { id: string; active: boolean; metadata: { flavor: 'codex'; codexSessionId?: string } }) => useSessionTargetResolver({
            api: api as never,
            session: session as never,
            onReady,
            onError,
        }), {
            initialProps: {
                id: 'session-1',
                active: false,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1'
                }
            }
        })

        await expect(result.current()).resolves.toBeUndefined()

        expect(api.resumeSession).toHaveBeenCalledTimes(1)
        expect(onReady).toHaveBeenCalledWith(resumedSession)
        expect(onError).not.toHaveBeenCalled()

        rerender({
            id: 'session-1',
            active: true,
            metadata: {
                flavor: 'codex',
                codexSessionId: 'thread-1'
            }
        })

        await expect(result.current()).resolves.toBeUndefined()
        expect(api.resumeSession).toHaveBeenCalledTimes(1)
    })

    it('dedupes concurrent resume requests while a resume is in flight', async () => {
        let resolveResume: ((session: { id: string; active: boolean; metadata: { flavor: 'codex'; codexSessionId: string } }) => void) | null = null
        const api = {
            resumeSession: vi.fn().mockImplementation(() => new Promise((resolve) => {
                resolveResume = resolve
            }))
        }
        const onReady = vi.fn()

        const { result } = renderHook(() => useSessionTargetResolver({
            api: api as never,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1'
                }
            } as never,
            onReady,
            onError: vi.fn(),
        }))

        let readyCount = 0
        await act(async () => {
            const first = result.current()
            const second = result.current()

            expect(api.resumeSession).toHaveBeenCalledTimes(1)

            resolveResume?.({
                id: 'session-1',
                active: true,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1'
                }
            })
            await Promise.all([first, second])
            readyCount = onReady.mock.calls.length
        })

        expect(readyCount).toBe(1)
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('fails fast for closed sessions without a resume marker', async () => {
        const api = {
            resumeSession: vi.fn()
        }
        const onReady = vi.fn()
        const onError = vi.fn()

        const { result } = renderHook(() => useSessionTargetResolver({
            api: api as never,
            session: {
                id: 'session-legacy',
                active: false,
                metadata: {
                    flavor: 'codex'
                }
            } as never,
            onReady,
            onError,
        }))

        await expect(result.current()).rejects.toMatchObject({
            code: 'resume_unavailable'
        })
        expect(api.resumeSession).not.toHaveBeenCalled()
        expect(onReady).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            code: 'resume_unavailable'
        }), 'session-legacy')
    })

    it('auto-unarchives archived sessions before resuming them on the same explicit send chain', async () => {
        const restoredSession = {
            id: 'session-1',
            active: false,
            metadata: {
                flavor: 'codex',
                codexSessionId: 'thread-1',
                lifecycleState: 'closed'
            }
        }
        const resumedSession = {
            ...restoredSession,
            active: true,
            metadata: {
                ...restoredSession.metadata,
                lifecycleState: 'running'
            }
        }
        const api = {
            unarchiveSession: vi.fn().mockResolvedValue(restoredSession),
            resumeSession: vi.fn().mockResolvedValue(resumedSession)
        }
        const onReady = vi.fn()
        const onError = vi.fn()

        const { result } = renderHook(() => useSessionTargetResolver({
            api: api as never,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1',
                    lifecycleState: 'archived'
                }
            } as never,
            onReady,
            onError,
        }))

        await expect(result.current()).resolves.toBeUndefined()

        expect(api.unarchiveSession).toHaveBeenCalledWith('session-1')
        expect(api.resumeSession).toHaveBeenCalledWith('session-1')
        expect(onReady).toHaveBeenNthCalledWith(1, restoredSession)
        expect(onReady).toHaveBeenNthCalledWith(2, resumedSession)
        expect(onError).not.toHaveBeenCalled()
    })

    it('keeps background warmup failures silent when requested', async () => {
        const api = {
            resumeSession: vi.fn().mockRejectedValue(new Error('no machine online'))
        }
        const onReady = vi.fn()
        const onError = vi.fn()

        const { result } = renderHook(() => useSessionTargetResolver({
            api: api as never,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1'
                }
            } as never,
            onReady,
            onError,
        }))

        await expect(result.current({ silent: true })).rejects.toThrow('no machine online')
        expect(onReady).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
    })

    it('still reports an in-flight background failure when an explicit resume joins later', async () => {
        let rejectResume: ((error: Error) => void) | null = null
        const api = {
            resumeSession: vi.fn().mockImplementation(() => new Promise((_, reject) => {
                rejectResume = reject
            }))
        }
        const onReady = vi.fn()
        const onError = vi.fn()

        const { result } = renderHook(() => useSessionTargetResolver({
            api: api as never,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1'
                }
            } as never,
            onReady,
            onError,
        }))

        await act(async () => {
            const silentResume = result.current({ silent: true }).catch(() => undefined)
            const explicitResume = result.current()

            rejectResume?.(new Error('resume failed'))

            await expect(explicitResume).rejects.toThrow('resume failed')
            await silentResume
        })

        expect(api.resumeSession).toHaveBeenCalledTimes(1)
        expect(onReady).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith(expect.any(Error), 'session-1')
        expect(onError).toHaveBeenCalledTimes(1)
    })
})
