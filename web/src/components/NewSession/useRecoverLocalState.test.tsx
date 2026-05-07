import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRecoverLocalState } from './useRecoverLocalState'

function createLocalSessions(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        driver: 'codex',
        providerSessionId: `provider-${index + 1}`,
        path: '/repo',
        title: `Session ${index + 1}`,
        summary: null,
        startedAt: index + 1,
        messageCount: index + 1,
        updatedAt: index + 1,
    }))
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })

    return { promise, resolve }
}

describe('useRecoverLocalState', () => {
    it('keeps recovery pending until the imported session opens', async () => {
        const opening = createDeferred()
        const api = {
            listRuntimeLocalSessions: vi.fn(async () => ({
                capabilities: [],
                sessions: [
                    {
                        driver: 'codex',
                        providerSessionId: 'provider-1',
                        path: '/repo',
                        title: 'Recovered',
                        summary: null,
                        messageCount: 1,
                        updatedAt: 1,
                    },
                ],
            })),
            importRuntimeLocalSession: vi.fn(async () => ({ session: { id: 'session-1' } })),
        }
        const onSuccess = vi.fn(() => opening.promise)
        const { result } = renderHook(() =>
            useRecoverLocalState({
                api: api as never,
                initialMode: 'recover-local',
                isFormDisabled: false,
                directory: '/repo',
                haptic: { notification: vi.fn() },
                onSuccess,
                clearError: vi.fn(),
                setError: vi.fn(),
                formatError: String,
                t: (key) => key,
            })
        )

        act(() => {
            result.current.panelProps.onDriverSelectionChange('codex')
        })

        await waitFor(() => {
            expect(result.current.canRecover).toBe(true)
        })

        await act(async () => {
            void result.current.handleRecover()
        })

        await waitFor(() => {
            expect(result.current.isRecovering).toBe(true)
        })

        await act(async () => {
            opening.resolve()
            await opening.promise
        })

        expect(onSuccess).toHaveBeenCalledWith('session-1')
        expect(result.current.isRecovering).toBe(false)
    })

    it('resets stale selection when searching a loaded recover-local catalog', async () => {
        const api = {
            listRuntimeLocalSessions: vi.fn(async () => ({ capabilities: [], sessions: createLocalSessions(30) })),
            importRuntimeLocalSession: vi.fn(async () => ({ session: { id: 'session-1' } })),
        }
        const { result } = renderHook(() =>
            useRecoverLocalState({
                api: api as never,
                initialMode: 'recover-local',
                isFormDisabled: false,
                directory: '/repo',
                haptic: { notification: vi.fn() },
                onSuccess: vi.fn(),
                clearError: vi.fn(),
                setError: vi.fn(),
                formatError: String,
                t: (key) => key,
            })
        )

        act(() => {
            result.current.panelProps.onDriverSelectionChange('codex')
        })
        await waitFor(() => expect(result.current.panelProps.selectedSessionKey).toBe('codex:provider-1'))

        act(() => {
            result.current.panelProps.onSelectSession('codex:provider-30')
            result.current.panelProps.onSearchQueryChange('Session 2')
        })

        await waitFor(() => {
            expect(result.current.panelProps.selectedSessionKey).toBe('codex:provider-2')
        })
    })
})
