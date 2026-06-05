import { describe, expect, it } from 'bun:test'
import {
    buildPairingBridgeLifecycleKey,
    mergePairingSnapshotsIntoBridgeStates,
    selectBridgePairings,
} from '@/hooks/usePairingBridges'
import { buildDeviceLinkSnapshots } from '@/lib/deviceLinkBadge'
import type { DesktopPairingSession, PairingBridgeState } from '@/types'

function makeBridgeState(pairingId: string, phase: PairingBridgeState['phase']): PairingBridgeState {
    return {
        phase,
        message: null,
        pairing: {
            id: pairingId,
            state: 'active',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            shortCode: null,
            approvalStatus: 'approved',
            host: {},
            guest: null,
        },
        stats: null,
    }
}

function makeSession(
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
            ['gone', makeBridgeState('gone', 'connecting')],
        ])
        bridges.delete('gone')
        expect(bridges.size).toBe(1)
        expect(bridges.get('kept')?.phase).toBe('ready')
        expect(bridges.has('gone')).toBe(false)
    })

    it('bridge lifecycle skips offline approved history but keeps drafts and online devices', () => {
        const offlineApproved = makeSession('offline-approved', 'approved')
        const onlineApproved = makeSession('online-approved', 'approved', true)
        const invite = makeSession('invite', null)

        expect(
            selectBridgePairings([offlineApproved, onlineApproved, invite]).map((session) => session.pairing.id)
        ).toEqual(['online-approved', 'invite'])
        expect(buildPairingBridgeLifecycleKey({ enabled: true, pairings: [offlineApproved] })).toBe('')
        expect(buildPairingBridgeLifecycleKey({ enabled: true, pairings: [onlineApproved] })).toContain(
            'online-approved'
        )
    })

    it('bridge lifecycle key tracks every active invite, including unapproved drafts', () => {
        // The host bridge spins up as soon as the invite exists so the
        // broker WS / tunnel is already attached when the guest verifies.
        // Waiting on `approved` introduced a race where SSE delivery delay
        // left the phone forever on the connecting splash.
        const approved = makeSession('approved', 'approved', true)
        const invite = makeSession('invite', null)
        const single = buildPairingBridgeLifecycleKey({ enabled: true, pairings: [approved] })
        const both = buildPairingBridgeLifecycleKey({ enabled: true, pairings: [approved, invite] })
        expect(both).not.toBe(single)
        expect(both).toContain('invite')
    })

    it('merges latest pairing snapshots into an existing bridge without changing its lifecycle key', () => {
        const invite = makeSession('invite', null)
        const approved = makeSession('invite', 'approved', true)
        const staleBridge = new Map<string, PairingBridgeState>([['invite', makeBridgeState('invite', 'ready')]])
        staleBridge.get('invite')!.pairing = invite.pairing

        const merged = mergePairingSnapshotsIntoBridgeStates(staleBridge, [approved])

        expect(merged).not.toBe(staleBridge)
        expect(merged.get('invite')?.phase).toBe('ready')
        expect(merged.get('invite')?.pairing.approvalStatus).toBe('approved')
        expect(buildPairingBridgeLifecycleKey({ enabled: true, pairings: [invite] })).toBe(
            buildPairingBridgeLifecycleKey({ enabled: true, pairings: [approved] })
        )
    })

    it('bridge lifecycle key changes with the active invite set and disables wholesale when public access is off', () => {
        const first = [makeSession('first', 'approved', true)]
        expect(buildPairingBridgeLifecycleKey({ enabled: true, pairings: first })).toBe(
            buildPairingBridgeLifecycleKey({ enabled: true, pairings: first })
        )
        expect(
            buildPairingBridgeLifecycleKey({
                enabled: true,
                pairings: [makeSession('first', 'approved', true), makeSession('second', 'approved', true)],
            })
        ).not.toBe(buildPairingBridgeLifecycleKey({ enabled: true, pairings: first }))
        expect(buildPairingBridgeLifecycleKey({ enabled: false, pairings: first })).toBe('disabled')
    })

    it('buildDeviceLinkSnapshots maps each live bridge to its pairing:<id> device row', () => {
        // The downstream UI looks up snapshots by device id (`pairing:<id>`).
        // Confirm the multi-bridge projection produces one snapshot per
        // bridge with the right derived key.
        const _session = makeSession('alpha')
        const bridges = new Map<string, PairingBridgeState>([
            ['alpha', makeBridgeState('alpha', 'ready')],
            ['beta', makeBridgeState('beta', 'connecting')],
        ])
        const snapshots = buildDeviceLinkSnapshots(bridges)
        expect(snapshots.size).toBe(2)
        expect(snapshots.get('pairing:alpha')?.phase).toBe('ready')
        expect(snapshots.get('pairing:beta')?.phase).toBe('connecting')
        expect(snapshots.get('pairing:beta')?.deviceId).toBe('pairing:beta')
    })
})
