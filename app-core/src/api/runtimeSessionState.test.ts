import { describe, expect, it } from 'vitest'
import { isExternalUserMessage } from './runtimeSessionState'

describe('isExternalUserMessage', () => {
    it('accepts real external user text messages', () => {
        expect(
            isExternalUserMessage({
                type: 'user',
                message: { role: 'user', content: 'hello' },
            } as never)
        ).toBe(true)
    })

    it('rejects non-user, sidechain, meta, and system-injected pseudo-user messages', () => {
        expect(isExternalUserMessage({ type: 'assistant', message: { content: 'hello' } } as never)).toBe(false)
        expect(isExternalUserMessage({ type: 'user', isSidechain: true, message: { content: 'hello' } } as never)).toBe(
            false
        )
        expect(isExternalUserMessage({ type: 'user', isMeta: true, message: { content: 'hello' } } as never)).toBe(
            false
        )
        expect(
            isExternalUserMessage({
                type: 'user',
                message: { role: 'user', content: '<system-reminder>internal</system-reminder>' },
            } as never)
        ).toBe(false)
    })
})
