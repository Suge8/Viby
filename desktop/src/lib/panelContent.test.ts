import { describe, expect, it } from 'bun:test'
import { getEmptyKeyMessage } from './panelContent'

describe('panelContent', () => {
    it('keeps the access-key empty state copy in one place', () => {
        expect(getEmptyKeyMessage()).toBe('当前还没有访问密钥。')
    })
})
