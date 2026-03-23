import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { useSessionChatLocalNotices } from './useSessionChatLocalNotices'

const harness = vi.hoisted(() => ({
    addToast: vi.fn()
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({
        addToast: harness.addToast
    })
}))

function I18nWrapper(props: { children: ReactNode }): React.JSX.Element {
    return <I18nProvider>{props.children}</I18nProvider>
}

function createDeferred(): {
    promise: Promise<void>
    resolve: () => void
} {
    let resolvePromise!: () => void
    const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve
    })

    return {
        promise,
        resolve: resolvePromise
    }
}

describe('useSessionChatLocalNotices', () => {
    beforeEach(() => {
        harness.addToast.mockReset()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns no local notices for a closed session without warnings', () => {
        const { result } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-1',
            lifecycleState: 'closed',
            messagesWarning: null,
            onUnarchiveSession: vi.fn(async () => undefined)
        }), {
            wrapper: I18nWrapper
        })

        expect(result.current.localNotices).toEqual([])
    })

    it('keeps archived restore and message warnings in the local notice stack', async () => {
        const deferred = createDeferred()
        const onUnarchiveSession = vi.fn(() => deferred.promise)
        const { result } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-1',
            lifecycleState: 'archived',
            messagesWarning: 'New replies arrived while you were away.',
            onUnarchiveSession
        }), {
            wrapper: I18nWrapper
        })

        expect(result.current.localNotices).toHaveLength(2)
        expect(result.current.localNotices[0]).toMatchObject({
            id: 'chat:session-1:archived',
            title: 'This session is archived. Restore it to the main list before sending a new message.'
        })
        expect(result.current.localNotices[1]).toMatchObject({
            id: 'chat:session-1:message-window-warning',
            title: 'New replies arrived while you were away.'
        })

        act(() => {
            result.current.localNotices[0].action?.onPress()
        })

        await waitFor(() => {
            expect(result.current.localNotices[0].action?.pending).toBe(true)
        })

        act(() => {
            result.current.localNotices[0].action?.onPress()
        })

        expect(onUnarchiveSession).toHaveBeenCalledTimes(1)

        await act(async () => {
            deferred.resolve()
            await deferred.promise
        })

        await waitFor(() => {
            expect(result.current.localNotices[0].action?.pending).toBe(false)
        })
    })

    it('shows a toast when archived restore fails', async () => {
        const { result } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-1',
            lifecycleState: 'archived',
            messagesWarning: null,
            onUnarchiveSession: vi.fn(async () => {
                throw new Error('restore failed')
            })
        }), {
            wrapper: I18nWrapper
        })

        act(() => {
            result.current.localNotices[0].action?.onPress()
        })

        await waitFor(() => {
            expect(harness.addToast).toHaveBeenCalledWith({
                title: 'Something went wrong',
                description: 'restore failed',
                tone: 'danger'
            })
        })

        expect(result.current.localNotices[0].action?.pending).toBe(false)
    })
})
