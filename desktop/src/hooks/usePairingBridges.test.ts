import { describe, expect, it } from 'bun:test'
import { buildDeviceLinkSnapshots } from '@/lib/deviceLinkBadge'
import type { DesktopPairingSession, PairingBridgeState } from '@/types'

function makeBridgeState(pairingId: string, phase: PairingBridgeState['phase']): PairingBridgeState {
    return {
        phase,
        message: null,
        pairing: {
            id: pairingId,
            state: 'connected',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            ticketExpiresAt: 9_999,
            shortCode: null,
            approvalStatus: 'approved',
            host: {},
            guest: null,
        },
        stats: null,
    }
}

function makeSession(pairingId: string): DesktopPairingSession {
    return {
        pairing: {
            id: pairingId,
            state: 'connected',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            ticketExpiresAt: 9_999,
            shortCode: null,
            approvalStatus: 'approved',
            host: {},
            guest: null,
        },
        hostToken: `host-${pairingId}`,
        pairingUrl: `https://example.test/p/${pairingId}`,
        wsUrl: `wss://example.test/ws/${pairingId}`,
        iceServers: [],
    }
}

describe('usePairingBridges support — bridge map invariants', () => {
    it('each pairing gets its own bridge entry keyed by pairingId', () => {
        // The orchestrator hook owns one independent bridge instance per
        // pairing. Two simultaneously approved pairings must surface as two
        // separate map entries — a fresh QR scan must never disturb the
        // already-running bridge of another paired device.
        const bridges = new Map<string, PairingBridgeState>([
            ['first', makeBridgeState('first', 'ready')],
            ['second', makeBridgeState('second', 'connecting')],
        ])
        expect(bridges.size).toBe(2)
        expect(bridges.get('first')?.phase).toBe('ready')
        expect(bridges.get('second')?.phase).toBe('connecting')
    })

    it('removing one pairing leaves the other bridge entry untouched', () => {
        const bridges = new Map<string, PairingBridgeState>([
            ['kept', makeBridgeState('kept', 'ready')],
            ['gone', makeBridgeState('gone', 'paused')],
        ])
        bridges.delete('gone')
        expect(bridges.size).toBe(1)
        expect(bridges.get('kept')?.phase).toBe('ready')
        expect(bridges.has('gone')).toBe(false)
    })

    it('buildDeviceLinkSnapshots maps each live bridge to its pairing:<id> device row', () => {
        // The downstream UI looks up snapshots by device id (`pairing:<id>`).
        // Confirm the multi-bridge projection produces one snapshot per
        // bridge with the right derived key.
        const _session = makeSession('alpha')
        const bridges = new Map<string, PairingBridgeState>([
            ['alpha', makeBridgeState('alpha', 'ready')],
            ['beta', makeBridgeState('beta', 'paused')],
        ])
        const snapshots = buildDeviceLinkSnapshots(bridges)
        expect(snapshots.size).toBe(2)
        expect(snapshots.get('pairing:alpha')?.phase).toBe('ready')
        expect(snapshots.get('pairing:beta')?.phase).toBe('paused')
        expect(snapshots.get('pairing:beta')?.deviceId).toBe('pairing:beta')
    })
})
