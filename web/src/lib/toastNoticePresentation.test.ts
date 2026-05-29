import { describe, expect, it } from 'vitest'
import { presentToastEvent } from '@/lib/toastNoticePresentation'

describe('presentToastEvent', () => {
    it('falls back to raw toast copy', () => {
        const notice = presentToastEvent({
            type: 'toast',
            data: {
                title: 'Raw title',
                body: 'Raw body',
                sessionId: 'session-1',
                url: '/sessions/session-1',
            },
        })

        expect(notice).toEqual({
            title: 'Raw title',
            description: 'Raw body',
        })
    })
})
