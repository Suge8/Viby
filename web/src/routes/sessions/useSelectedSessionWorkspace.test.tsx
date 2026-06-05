import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSelectedSessionWorkspace } from './useSelectedSessionWorkspace'

const mocks = vi.hoisted(() => ({
    finalizeBootShell: vi.fn(),
    routeModel: vi.fn(),
    setMessageWindowAtBottom: vi.fn(),
}))

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: mocks.finalizeBootShell,
}))

vi.mock('@/routes/sessions/useSessionChatRouteModel', () => ({
    useSessionChatRouteModel: mocks.routeModel,
}))

vi.mock('@/lib/messageWindowStoreCore', () => ({
    setAtBottom: mocks.setMessageWindowAtBottom,
}))

const sessionChatProps = {
    workspace: { session: { id: 'session-1' } },
} as never

const baseOptions = {
    api: {} as never,
    isSessionDetailHydrated: true,
    onRetainedSnapshotReady: vi.fn(),
    retainedSnapshot: null,
    session: { id: 'session-1' } as never,
    sessionId: 'session-1',
}

describe('useSelectedSessionWorkspace', () => {
    beforeEach(() => {
        mocks.finalizeBootShell.mockClear()
        mocks.routeModel.mockReset()
        baseOptions.onRetainedSnapshotReady.mockClear()
        mocks.setMessageWindowAtBottom.mockClear()
    })

    it('returns ready and persists the retained snapshot', async () => {
        mocks.routeModel.mockReturnValue({ isSessionDetailReady: true, sessionChatProps })

        const { result } = renderHook(() => useSelectedSessionWorkspace(baseOptions))

        expect(result.current.surface).toBe('ready')
        expect(mocks.finalizeBootShell).toHaveBeenCalledWith(true)
        expect(mocks.setMessageWindowAtBottom).toHaveBeenCalledWith('session-1', true)
        await waitFor(() => {
            expect(baseOptions.onRetainedSnapshotReady).toHaveBeenCalledWith({
                routeSessionId: 'session-1',
                sessionChatProps,
            })
        })
    })

    it('resets the entry scroll state when the selected session changes', () => {
        mocks.routeModel.mockReturnValue({ isSessionDetailReady: true, sessionChatProps })

        const { rerender } = renderHook(
            ({ sessionId }) =>
                useSelectedSessionWorkspace({
                    ...baseOptions,
                    session: { id: sessionId } as never,
                    sessionId,
                }),
            { initialProps: { sessionId: 'session-1' } }
        )

        rerender({ sessionId: 'session-2' })

        expect(mocks.setMessageWindowAtBottom).toHaveBeenCalledWith('session-1', true)
        expect(mocks.setMessageWindowAtBottom).toHaveBeenCalledWith('session-2', true)
    })

    it('applies entry scroll policy even while the session detail is pending', () => {
        mocks.routeModel.mockReturnValue({ isSessionDetailReady: false, sessionChatProps: null })

        const { result } = renderHook(() => useSelectedSessionWorkspace(baseOptions))

        expect(result.current.surface).toBe('pending')
        expect(mocks.setMessageWindowAtBottom).toHaveBeenCalledWith('session-1', true)
        expect(baseOptions.onRetainedSnapshotReady).not.toHaveBeenCalled()
    })

    it('uses retained surface while the next session is pending', () => {
        mocks.routeModel.mockReturnValue({ isSessionDetailReady: false, sessionChatProps: null })

        const { result } = renderHook(() =>
            useSelectedSessionWorkspace({
                ...baseOptions,
                retainedSnapshot: { routeSessionId: 'session-1', sessionChatProps },
                sessionId: 'session-2',
            })
        )

        expect(result.current.surface).toBe('retained')
        expect(result.current.sessionChatProps).toBe(sessionChatProps)
        expect(mocks.setMessageWindowAtBottom).toHaveBeenCalledWith('session-2', true)
        expect(baseOptions.onRetainedSnapshotReady).not.toHaveBeenCalled()
    })
})
