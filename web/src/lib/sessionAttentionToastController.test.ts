import { describe, expect, it } from 'vitest'
import { presentSessionAttentionToast, type SessionAttentionSnapshot } from '@/lib/sessionAttentionToastController'

function t(key: string, params?: Record<string, string | number>): string {
    return params ? `${key}:${JSON.stringify(params)}` : key
}

function snapshot(overrides: Partial<SessionAttentionSnapshot> = {}): SessionAttentionSnapshot {
    return {
        sessionId: 'session-1',
        title: 'Build Viby',
        turnState: 'processing',
        latestCompletedReplyAt: null,
        pendingRequestsCount: 0,
        requestIds: [],
        ...overrides,
    }
}

describe('presentSessionAttentionToast', () => {
    it('announces completed replies after a processing to awaiting-input transition', () => {
        const notice = presentSessionAttentionToast({
            before: snapshot({ latestCompletedReplyAt: 100 }),
            after: snapshot({ turnState: 'awaiting-input', latestCompletedReplyAt: 200 }),
            selectedSessionId: null,
            t,
        })

        expect(notice).toEqual({
            title: 'notice.toast.ready.title',
            description: 'notice.toast.session.description:{"session":"Build Viby"}',
            tone: 'success',
            href: '/sessions/session-1',
        })
    })

    it('announces new permission requests', () => {
        const notice = presentSessionAttentionToast({
            before: snapshot({ turnState: 'awaiting-input', requestIds: [], pendingRequestsCount: 0 }),
            after: snapshot({ turnState: 'awaiting-input', requestIds: ['request-1'], pendingRequestsCount: 1 }),
            selectedSessionId: null,
            t,
        })

        expect(notice).toMatchObject({
            title: 'notice.toast.permission.title',
            tone: 'warning',
            href: '/sessions/session-1',
        })
    })

    it('announces replaced permission requests even when the count stays flat', () => {
        const notice = presentSessionAttentionToast({
            before: snapshot({ turnState: 'awaiting-input', requestIds: ['request-1'], pendingRequestsCount: 1 }),
            after: snapshot({ turnState: 'awaiting-input', requestIds: ['request-2'], pendingRequestsCount: 1 }),
            selectedSessionId: null,
            t,
        })

        expect(notice?.title).toBe('notice.toast.permission.title')
    })

    it('suppresses current-session and cold-start transitions', () => {
        const after = snapshot({ turnState: 'awaiting-input', latestCompletedReplyAt: 200 })

        expect(
            presentSessionAttentionToast({
                before: snapshot({ latestCompletedReplyAt: 100 }),
                after,
                selectedSessionId: 'session-1',
                t,
            })
        ).toBeNull()
        expect(presentSessionAttentionToast({ before: null, after, selectedSessionId: null, t })).toBeNull()
    })
})
