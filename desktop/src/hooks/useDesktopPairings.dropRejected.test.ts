import { describe, expect, it } from 'bun:test'
import type { DesktopPairingSession } from '@/types'
import { resolveStoredDesktopPairings } from './useDesktopPairings'

/**
 * Startup cleanup is the *secondary* defence for D11 (stale-pairing churn). The
 * primary fix is the relay bridge going terminal on a broker auth-reject (see
 * pairingRelayBridge.test.ts + the staleStartup integration test). These cases
 * lock the cleanup classifier so a transient broker hiccup never over-deletes a
 * still-valid pairing.
 */

function makeSession(id: string, expiresAt = 4_102_444_800_000): DesktopPairingSession {
    return {
        pairing: {
            id,
            state: 'active',
            createdAt: 1,
            updatedAt: 2,
            expiresAt,
            shortCode: '123456',
            approvalStatus: 'approved',
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

describe('resolveStoredDesktopPairings — over-delete safety', () => {
    it('keeps a valid pairing when a sibling stale one is being pruned', async () => {
        const removed: string[] = []
        const resolved = await resolveStoredDesktopPairings({
            now: 10,
            sessions: [makeSession('keep'), makeSession('stale')],
            removePairing: async (id) => {
                removed.push(id)
            },
            refreshPairing: async (pairing) => {
                if (pairing.pairing.id === 'stale') throw new Error('Pairing session no longer active')
                return pairing
            },
        })
        expect(resolved.sessions.map((session) => session.pairing.id)).toEqual(['keep'])
        expect(removed).toEqual(['stale'])
        expect(resolved.firstError).toBeNull()
    })

    it('does not delete on a transient network error and surfaces it', async () => {
        const removed: string[] = []
        const resolved = await resolveStoredDesktopPairings({
            now: 10,
            sessions: [makeSession('flaky')],
            removePairing: async (id) => {
                removed.push(id)
            },
            refreshPairing: async () => {
                throw new Error('fetch failed: ECONNREFUSED')
            },
        })
        expect(resolved.sessions.map((session) => session.pairing.id)).toEqual(['flaky'])
        expect(removed).toEqual([])
        expect(resolved.firstError).toBeInstanceOf(Error)
    })
})
