import { describe, expect, it } from 'bun:test'
import { getEmptyKeyMessage } from './panelContent'

describe('panelContent', () => {
    it('keeps the empty entry copy in one place', () => {
        expect(getEmptyKeyMessage()).toBe('当前还没有可复制的入口。')
    })
})
