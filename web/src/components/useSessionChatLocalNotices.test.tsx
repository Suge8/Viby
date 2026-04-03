import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY,
    MESSAGE_WINDOW_POST_SWITCH_NO_REPLY_WARNING_KEY,
    MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY
} from '@/lib/messageWindowWarnings'
import { I18nTestWrapper, preloadI18nForTests } from '@/test/i18n'
import { useSessionChatLocalNotices } from './useSessionChatLocalNotices'

const harness = vi.hoisted(() => ({
    addToast: vi.fn()
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({
        addToast: harness.addToast
    })
}))

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

    it('returns no local notices for a closed session without warnings', async () => {
        await preloadI18nForTests()
        const { result } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-1',
            lifecycleState: 'closed',
            messagesWarning: null,
            onRestoreSession: vi.fn(async () => undefined)
        }), {
            wrapper: I18nTestWrapper
        })

        expect(result.current.localNotices).toEqual([])
    })

    it('keeps archived restore and pending-overflow warnings in the local notice stack', async () => {
        await preloadI18nForTests()
        const deferred = createDeferred()
        const onRestoreSession = vi.fn(() => deferred.promise)
        const { result } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-1',
            lifecycleState: 'archived',
            messagesWarning: MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY,
            onRestoreSession
        }), {
            wrapper: I18nTestWrapper
        })

        expect(result.current.localNotices).toHaveLength(2)
        expect(result.current.localNotices[0]).toMatchObject({
            id: 'chat:session-1:archived',
            title: 'This session is archived. Sending a new message or tapping Restore will bring it back online automatically.'
        })
        expect(result.current.localNotices[1]).toMatchObject({
            id: 'chat:session-1:message-window-warning',
            title: 'New replies arrived while you were away. Scroll to the bottom to refresh.'
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

        expect(onRestoreSession).toHaveBeenCalledTimes(1)

        await act(async () => {
            deferred.resolve()
            await deferred.promise
        })

        await waitFor(() => {
            expect(result.current.localNotices[0].action?.pending).toBe(false)
        })
    })

    it('maps post-switch warning keys through the same local notice owner without replacing archived notices', async () => {
        await preloadI18nForTests()

        const { result: failureResult } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-1',
            lifecycleState: 'archived',
            messagesWarning: MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY,
            onRestoreSession: vi.fn(async () => undefined)
        }), {
            wrapper: I18nTestWrapper
        })

        expect(failureResult.current.localNotices).toHaveLength(2)
        expect(failureResult.current.localNotices[0]?.id).toBe('chat:session-1:archived')
        expect(failureResult.current.localNotices[1]).toMatchObject({
            id: 'chat:session-1:message-window-warning',
            title: 'The first post-switch message failed before the new agent could reply. Send it again to keep going.'
        })

        const { result: noReplyResult } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-2',
            lifecycleState: 'closed',
            messagesWarning: MESSAGE_WINDOW_POST_SWITCH_NO_REPLY_WARNING_KEY,
            onRestoreSession: vi.fn(async () => undefined)
        }), {
            wrapper: I18nTestWrapper
        })

        expect(noReplyResult.current.localNotices).toEqual([
            expect.objectContaining({
                id: 'chat:session-2:message-window-warning',
                title: 'The new agent never replied after the switch. Send the message again to continue in this session.'
            })
        ])
    })

    it('shows a toast when archived restore fails', async () => {
        await preloadI18nForTests()
        const { result } = renderHook(() => useSessionChatLocalNotices({
            sessionId: 'session-1',
            lifecycleState: 'archived',
            messagesWarning: null,
            onRestoreSession: vi.fn(async () => {
                throw new Error('restore failed')
            })
        }), {
            wrapper: I18nTestWrapper
        })

        act(() => {
            result.current.localNotices[0].action?.onPress()
        })

        await waitFor(() => {
            expect(harness.addToast).toHaveBeenCalledWith({
                title: 'Something went wrong',
                description: 'Failed to resume this session.',
                tone: 'danger'
            })
        })

        expect(result.current.localNotices[0].action?.pending).toBe(false)
    })
})
