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
})
