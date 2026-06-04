import { describe, expect, it } from 'vitest'
import { createRemotePairingEventSeq } from './remotePairingEventSeq'

describe('createRemotePairingEventSeq', () => {
    it('drops duplicates and never regresses on forced snapshot reset', () => {
        const seq = createRemotePairingEventSeq()

        expect(seq.accept(2)).toBe(true)
        expect(seq.accept(2)).toBe(false)
        expect(seq.accept(1, true)).toBe(true)
        expect(seq.lastSeen()).toBe(2)
        expect(seq.accept(3)).toBe(true)
        expect(seq.lastSeen()).toBe(3)
    })
})
