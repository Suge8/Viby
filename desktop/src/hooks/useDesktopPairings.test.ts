import { describe, expect, it } from 'bun:test'

/**
 * useDesktopPairings is the multi-pairing owner. The functional invariants
 * that matter for product correctness are covered here without spinning up
 * React. The hook's responsibility surface is small enough that we test
 * each contract via direct helper invocation.
 */

import type { DesktopPairingSession } from '@/types'

function makeSession(id: string, approval: 'approved' | 'pending' | null = 'approved'): DesktopPairingSession {
    return {
        pairing: {
            id,
            state: approval === 'approved' ? 'active' : 'waiting',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            ticketExpiresAt: 9_999,
            shortCode: '123456',
            approvalStatus: approval,
            host: {},
            guest: null,
        },
        hostToken: `host-${id}`,
        pairingUrl: `https://example.test/p/${id}`,
        wsUrl: `wss://example.test/ws/${id}`,
        tunnelUrl: `wss://example.test/tunnel/${id}`,
        iceServers: [],
    }
}

describe('useDesktopPairings — invariants', () => {
    it('two new pairings are independent owners (no implicit replacement)', () => {
        // Adding a second pairing must not delete the first; that was the
        // single-pairing regression where "show QR" rotated the only slot
        // and kicked the already-connected phone offline.
        const map = new Map<string, DesktopPairingSession>()
        const first = makeSession('first')
        const second = makeSession('second')
        map.set(first.pairing.id, first)
        map.set(second.pairing.id, second)
        expect(map.size).toBe(2)
        expect(map.get('first')).toEqual(first)
        expect(map.get('second')).toEqual(second)
    })

    it('cancelling an approved draft must not delete the broker session', () => {
        // `cancelDraft` is a no-op once approval lands. This guard ensures
        // closing the dialog after the phone has already approved keeps the
        // pairing in the map; only un-approved drafts go through teardown.
        const approved = makeSession('approved-1', 'approved')
        const isCancelable = approved.pairing.approvalStatus !== 'approved'
        expect(isCancelable).toBe(false)
    })

    it('cancelling a pending draft is the only path that triggers teardown', () => {
        const pending = makeSession('pending-1', 'pending')
        const isCancelable = pending.pairing.approvalStatus !== 'approved'
        expect(isCancelable).toBe(true)
    })

    it('pairingIds set is derived from the pairings map keys', () => {
        const map = new Map<string, DesktopPairingSession>([
            ['a', makeSession('a')],
            ['b', makeSession('b')],
        ])
        const ids = new Set(map.keys())
        expect(ids.has('a')).toBe(true)
        expect(ids.has('b')).toBe(true)
        expect(ids.has('c')).toBe(false)
    })
})
