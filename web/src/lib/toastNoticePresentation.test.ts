import { describe, expect, it } from 'vitest'
import { presentToastEvent } from '@/lib/toastNoticePresentation'

function t(key: string, params?: Record<string, string | number>): string {
    if (!params) {
        return key
    }

    return `${key}:${JSON.stringify(params)}`
}

describe('presentToastEvent', () => {
    it('localizes permission request notices from toast kind metadata', () => {
        const notice = presentToastEvent({
            type: 'toast',
            data: {
                title: 'Permission Request',
                body: 'Repo (Bash)',
                sessionId: 'session-1',
                url: '/sessions/session-1',
                tone: 'warning',
                kind: 'permission-request',
                sessionName: 'Repo',
                toolName: 'Bash'
            }
        }, t)

        expect(notice.title).toBe('notice.toast.permission.title')
        expect(notice.description).toContain('notice.toast.permission.description')
        expect(notice.description).toContain('"session":"Repo"')
        expect(notice.description).toContain('"tool":"Bash"')
    })

    it('falls back to raw toast copy for unknown toast kinds', () => {
        const notice = presentToastEvent({
            type: 'toast',
            data: {
                title: 'Ready',
                body: 'Agent is waiting',
                sessionId: 'session-1',
                url: '/sessions/session-1'
            }
        }, t)

        expect(notice).toEqual({
            title: 'Ready',
            description: 'Agent is waiting'
        })
    })
})
