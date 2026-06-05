import { describe, expect, it } from 'bun:test'
import { buildPairingHostEventTargets } from './usePairingHostEvents'
import type { DesktopPairingSession } from '@/types'

function pairingSession(
    pairingId: string,
    approvalStatus: DesktopPairingSession['pairing']['approvalStatus'] = 'approved',
    online = false
): DesktopPairingSession {
    return {
        pairing: {
            id: pairingId,
            state: 'active',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            shortCode: null,
            approvalStatus,
            host: {},
            guest: null,
            remoteConnections: online ? [{ id: 'window-1', connectedAt: 3, createdAt: 2, lastSeenAt: 3 }] : [],
        },
        hostToken: `host-${pairingId}`,
        pairingUrl: `https://example.test/p/${pairingId}`,
        wsUrl: `wss://example.test/ws/${pairingId}`,
        tunnelUrl: `wss://example.test/tunnel/${pairingId}`,
        eventsUrl: `https://example.test/events/${pairingId}`,
        iceServers: [],
    }
}

describe('buildPairingHostEventTargets', () => {
    it('skips offline approved history so it cannot keep SSE subscriptions alive', () => {
        const targets = buildPairingHostEventTargets([
            pairingSession('offline-approved', 'approved'),
            pairingSession('online-approved', 'approved', true),
            pairingSession('draft', null),
        ])

        expect(targets).toEqual([
            { pairingId: 'online-approved', eventsUrl: 'https://example.test/events/online-approved' },
            { pairingId: 'draft', eventsUrl: 'https://example.test/events/draft' },
        ])
    })
})
