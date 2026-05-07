import { describe, expect, it } from 'vitest'
import { parseMessageAsEvent } from './reducerEvents'
import type { NormalizedMessage } from './types'

function agentText(text: string): NormalizedMessage {
    return {
        id: 'message-1',
        localId: null,
        createdAt: 1,
        role: 'agent',
        isSidechain: false,
        content: [{ type: 'text', text, uuid: 'content-1', parentUUID: null }],
    }
}

describe('parseMessageAsEvent', () => {
    it('parses Claude rate-limit reached and warning events', () => {
        expect(parseMessageAsEvent(agentText('Claude AI usage limit reached|1774278000|five_hour'))).toEqual({
            type: 'limit-reached',
            endsAt: 1774278000,
            limitType: 'five_hour',
        })
        expect(parseMessageAsEvent(agentText('Claude AI usage limit warning|1774278000|90|seven_day'))).toEqual({
            type: 'limit-warning',
            endsAt: 1774278000,
            percent: 90,
            limitType: 'seven_day',
        })
    })
})
