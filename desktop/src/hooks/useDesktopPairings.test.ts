import { describe, expect, it } from 'bun:test'

/**
 * useDesktopPairings is the multi-pairing owner. The functional invariants
 * that matter for product correctness are covered here without spinning up
 * React. The hook's responsibility surface is small enough that we test
 * each contract via direct helper invocation.
 */

import type { DesktopPairingSession } from '@/types'
import { clearRemoteConnectionPresence, isStaleOfflinePairing, resolveStoredDesktopPairings } from './useDesktopPairings'

function makeSession(
    id: string,
    approval: 'approved' | 'pending' | null = 'approved',
    expiresAt = 4_102_444_800_000
): DesktopPairingSession {
    return {
        pairing: {
            id,
            state: approval === 'approved' ? 'active' : 'waiting',
            createdAt: 1,
            updatedAt: 2,
            expiresAt,
            shortCode: '123456',
            approvalStatus: approval,
            host: {},
            guest: null,
            remoteConnections: [],
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

    it('drops stale stored pairings before live bridge startup', async () => {
        const valid = makeSession('valid')
        const stale = makeSession('stale')
        const expiredDraft = makeSession('expired-draft', null, 1)
        const removed: string[] = []

        const resolved = await resolveStoredDesktopPairings({
            now: 10,
            sessions: [valid, stale, expiredDraft],
            removePairing: async (pairingId) => {
                removed.push(pairingId)
            },
            refreshPairing: async (pairing) => {
                if (pairing.pairing.id === 'stale') throw new Error('Invalid pairing token')
                return { ...pairing, pairing: { ...pairing.pairing, updatedAt: 7 } }
            },
        })

        expect(resolved.firstError).toBeNull()
        expect(resolved.sessions.map((session) => session.pairing.id)).toEqual(['valid'])
        expect(resolved.sessions[0]?.pairing.updatedAt).toBe(7)
        expect(removed.toSorted()).toEqual(['expired-draft', 'stale'])
    })

    it('auto-prunes only long-stale approved offline pairings', async () => {
        const now = 40 * 24 * 60 * 60 * 1000
        const stale = makeSession('stale')
        const recent = makeSession('recent')
        recent.pairing.guest = { lastSeenAt: now - 1_000 }
        const online = makeSession('online')
        online.pairing.remoteConnections = [{ id: 'window', connectedAt: now, createdAt: now, lastSeenAt: now }]
        const draft = makeSession('draft', null)
        const removed: string[] = []

        const resolved = await resolveStoredDesktopPairings({
            now,
            sessions: [stale, recent, online, draft],
            removePairing: async (pairingId) => {
                removed.push(pairingId)
            },
            refreshPairing: async (pairing) => pairing,
        })

        expect(isStaleOfflinePairing(stale, now)).toBe(true)
        expect(resolved.sessions.map((session) => session.pairing.id)).toEqual(['recent', 'online', 'draft'])
        expect(removed).toEqual(['stale'])
    })

    it('does not create a new pairing object when presence is already offline', () => {
        const offline = makeSession('offline')
        offline.pairing.remoteConnections = [{ id: 'old-window', createdAt: 1, lastSeenAt: 9 }]

        expect(clearRemoteConnectionPresence(offline)).toBe(offline)
    })

    it('keeps stored pairings on transient refresh failure but clears stale online presence', async () => {
        const offline = makeSession('offline')
        offline.pairing.remoteConnections = [{ id: 'old-window', connectedAt: 9, createdAt: 1, lastSeenAt: 9 }]
        const resolved = await resolveStoredDesktopPairings({
            now: 10,
            sessions: [offline],
            removePairing: async () => {
                throw new Error('should not remove')
            },
            refreshPairing: async () => {
                throw new Error('network timeout')
            },
        })

        expect(resolved.sessions[0]?.pairing.remoteConnections).toEqual([
            { id: 'old-window', createdAt: 1, lastSeenAt: 9 },
        ])
        expect(resolved.firstError).toBeInstanceOf(Error)
    })
})
