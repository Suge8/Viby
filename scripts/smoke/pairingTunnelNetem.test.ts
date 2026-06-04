import { describe, expect, it } from 'bun:test'
import { resolveMaxP95RttMs } from './pairingTunnelNetem'

describe('pairing tunnel netem latency budget', () => {
    it('keeps the local relay budget tight', () => {
        expect(resolveMaxP95RttMs(['bun', 'pairingTunnelNetemSmoke.ts'], {})).toBe(1_000)
    })

    it('uses a WAN-tolerant public budget for prod relay netem', () => {
        expect(resolveMaxP95RttMs(['bun', 'pairingTunnelNetemSmoke.ts', '--public'], {})).toBe(2_500)
    })

    it('allows explicit CI overrides without changing script defaults', () => {
        expect(resolveMaxP95RttMs(['bun', 'pairingTunnelNetemSmoke.ts', '--public'], { MAX_P95_RTT_MS: '900' })).toBe(
            900
        )
        expect(
            resolveMaxP95RttMs(['bun', 'pairingTunnelNetemSmoke.ts', '--public'], { PUBLIC_MAX_P95_RTT_MS: '1800' })
        ).toBe(1_800)
        expect(resolveMaxP95RttMs(['bun', 'pairingTunnelNetemSmoke.ts'], { LOCAL_MAX_P95_RTT_MS: '700' })).toBe(700)
    })
})
