import { describe, expect, it } from 'bun:test'
import { createPairingBridgeIceRestartGate } from './pairingBridgeIceRecovery'

describe('pairingBridgeIceRecovery', () => {
    it('allows the first ICE restart and throttles rapid repeats', () => {
        let now = 1_000
        const gate = createPairingBridgeIceRestartGate({ now: () => now })

        expect(gate.canRestart()).toBe(true)
        expect(gate.canRestart()).toBe(false)

        now += 10_000
        expect(gate.canRestart()).toBe(true)
    })
})
