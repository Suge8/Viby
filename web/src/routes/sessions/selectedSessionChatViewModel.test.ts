import { describe, expect, it } from 'vitest'
import { createSelectedSessionChatViewModel } from './selectedSessionChatViewModel'

const sessionChatProps = {
    workspace: {
        session: {
            id: 'session-1',
        },
    },
} as never

describe('selectedSessionChatViewModel', () => {
    it('returns ready when the selected session detail is ready', () => {
        expect(
            createSelectedSessionChatViewModel({
                isSessionDetailReady: true,
                retainedSnapshot: null,
                routeSessionId: 'session-1',
                sessionChatProps,
                sessionError: null,
            })
        ).toMatchObject({
            surface: 'ready',
            sessionChatProps,
        })
    })

    it('falls back to retained when the next route session is not ready yet', () => {
        expect(
            createSelectedSessionChatViewModel({
                isSessionDetailReady: false,
                retainedSnapshot: {
                    routeSessionId: 'session-1',
                    sessionChatProps,
                },
                routeSessionId: 'session-2',
                sessionChatProps: null,
                sessionError: null,
            })
        ).toMatchObject({
            surface: 'retained',
            sessionChatProps,
        })
    })

    it('stays pending when there is no ready or retained surface', () => {
        expect(
            createSelectedSessionChatViewModel({
                isSessionDetailReady: false,
                retainedSnapshot: null,
                routeSessionId: 'session-2',
                sessionChatProps: null,
                sessionError: null,
            })
        ).toMatchObject({
            surface: 'pending',
            sessionChatProps: null,
        })
    })
})
