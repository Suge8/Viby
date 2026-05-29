import { describe, expect, it } from 'bun:test'
import { presentSessionAttentionNotification } from './sessionAttentionNotification'

function t(key: string, params?: Record<string, string | number>): string {
    return params ? `${key}:${JSON.stringify(params)}` : key
}

describe('presentSessionAttentionNotification', () => {
    it('builds localized ready toast and push presentation', () => {
        expect(
            presentSessionAttentionNotification({ kind: 'ready', sessionId: 'session-1', sessionTitle: 'Repo' }, t)
        ).toEqual({
            toast: {
                title: 'notice.toast.ready.title',
                description: 'notice.toast.session.description:{"session":"Repo"}',
                tone: 'success',
                href: '/sessions/session-1',
            },
            push: {
                title: 'notice.toast.ready.title',
                body: 'notice.toast.session.description:{"session":"Repo"}',
                tag: 'ready-session-1',
                data: { type: 'ready', sessionId: 'session-1', url: '/sessions/session-1' },
            },
        })
    })

    it('includes the tool name only in permission push body', () => {
        const presentation = presentSessionAttentionNotification(
            { kind: 'permission-request', sessionId: 'session-1', sessionTitle: 'Repo', toolName: 'Bash' },
            t
        )

        expect(presentation.toast.description).toBe('notice.toast.session.description:{"session":"Repo"}')
        expect(presentation.push).toMatchObject({
            title: 'notice.toast.permission.title',
            body: 'notice.toast.session.descriptionWithTool:{"session":"Repo","tool":"Bash"}',
            tag: 'permission-session-1',
        })
    })

    it('has default product copy for Hub push notifications', () => {
        expect(
            presentSessionAttentionNotification({ kind: 'permission-request', sessionId: 's1', sessionTitle: 'Repo' })
                .push
        ).toEqual({
            title: '待审核',
            body: '会话：Repo',
            tag: 'permission-s1',
            data: { type: 'permission-request', sessionId: 's1', url: '/sessions/s1' },
        })
    })
})
