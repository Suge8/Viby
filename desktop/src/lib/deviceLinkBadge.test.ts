import { describe, expect, it } from 'bun:test'
import type { PairingBridgeState, PairingBridgeStats } from '@/types'
import type { DeviceAuthDevice } from './deviceAuthSummary'
import { buildDeviceLinkSnapshot, buildDeviceLinkStatus } from './deviceLinkBadge'

function pairingDevice(overrides: Partial<DeviceAuthDevice> = {}): DeviceAuthDevice {
    return {
        id: 'pairing:p-1',
        name: null,
        platform: 'ios',
        channel: 'scan',
        createdAt: 1,
        lastSeenAt: 2,
        revokedAt: null,
        active: true,
        ...overrides,
    }
}

function bridgeState(overrides: Partial<PairingBridgeState>): PairingBridgeState {
    return {
        phase: 'ready',
        message: null,
        pairing: {
            id: 'p-1',
            state: 'active',
            createdAt: 1,
            updatedAt: 1,
            expiresAt: 9_999,
            ticketExpiresAt: 9_999,
            shortCode: null,
            approvalStatus: 'approved',
            host: {},
            guest: { label: 'Device' },
        },
        stats: null,
        ...overrides,
    }
}

function bridgeStats(overrides: Partial<PairingBridgeStats>): PairingBridgeStats {
    return {
        transport: 'direct',
        transportMode: 'direct-webrtc',
        previousTransport: null,
        localCandidateType: null,
        remoteCandidateType: null,
        currentRoundTripTimeMs: null,
        sampledAt: 123,
        staleAfterMs: Number.MAX_SAFE_INTEGER,
        routeRevision: 0,
        directBlockedReason: null,
        restartCount: 0,
        ...overrides,
    }
}

describe('buildDeviceLinkSnapshot', () => {
    it('returns null when the bridge has no pairing', () => {
        const snapshot = buildDeviceLinkSnapshot({ phase: 'connecting', message: null, pairing: null, stats: null })
        expect(snapshot).toBeNull()
    })

    it('keys the snapshot by the pairing-derived device id', () => {
        const snapshot = buildDeviceLinkSnapshot(
            bridgeState({
                stats: bridgeStats({
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 28,
                }),
            })
        )
        expect(snapshot).toEqual({
            deviceId: 'pairing:p-1',
            phase: 'ready',
            stats: bridgeStats({
                transport: 'direct',
                transportMode: 'direct-webrtc',
                localCandidateType: 'host',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 28,
            }),
        })
    })
})

describe('buildDeviceLinkStatus', () => {
    it('shows direct transport with latency when the device matches the bridge', () => {
        const snapshot = buildDeviceLinkSnapshot(
            bridgeState({
                stats: bridgeStats({
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 28,
                }),
            })
        )
        expect(buildDeviceLinkStatus(pairingDevice(), snapshot)).toEqual({
            phase: 'direct',
            title: '点对点直连 · 28ms',
            tone: 'success',
            latencyMs: 28,
        })
    })

    it('does not keep showing an expired latency sample', () => {
        const snapshot = buildDeviceLinkSnapshot(
            bridgeState({
                stats: bridgeStats({
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 5,
                    sampledAt: 1,
                    staleAfterMs: 1,
                }),
            })
        )
        expect(buildDeviceLinkStatus(pairingDevice(), snapshot)).toEqual({
            phase: 'direct',
            title: '点对点直连',
            tone: 'success',
            latencyMs: null,
        })
    })

    it('shows relay transport when bridge stats land on TURN', () => {
        const snapshot = buildDeviceLinkSnapshot(
            bridgeState({
                stats: bridgeStats({
                    transport: 'relay',
                    transportMode: 'turn-webrtc',
                    localCandidateType: 'relay',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 120,
                }),
            })
        )
        expect(buildDeviceLinkStatus(pairingDevice(), snapshot)).toEqual({
            phase: 'relay',
            title: '安全中转 · 120ms',
            tone: 'warning',
            latencyMs: 120,
        })
    })

    it('reports lifecycle states from the bridge for the bound device', () => {
        const handshaking = buildDeviceLinkSnapshot(bridgeState({ phase: 'connecting' }))
        expect(buildDeviceLinkStatus(pairingDevice({ active: false }), handshaking)).toMatchObject({
            phase: 'handshaking',
            title: '正在握手',
        })

        const failed = buildDeviceLinkSnapshot(bridgeState({ phase: 'fatal' }))
        expect(buildDeviceLinkStatus(pairingDevice(), failed)).toMatchObject({
            phase: 'failed',
            title: '连接中断',
            tone: 'danger',
        })
    })

    it('falls back to the channel when a different device is bridged', () => {
        const snapshot = buildDeviceLinkSnapshot(bridgeState({ pairing: { ...bridgeState({}).pairing!, id: 'other' } }))
        expect(buildDeviceLinkStatus(pairingDevice(), snapshot)).toEqual({
            phase: 'public',
            title: '公网',
            tone: 'neutral',
            latencyMs: null,
        })
    })

    it('falls back to the channel when no bridge is running', () => {
        const linkDevice = pairingDevice({ id: 'lan-1', channel: 'link', active: true })
        expect(buildDeviceLinkStatus(linkDevice, null)).toEqual({
            phase: 'lan',
            title: '局域网',
            tone: 'success',
            latencyMs: null,
        })

        const offlineDevice = pairingDevice({ active: false })
        expect(buildDeviceLinkStatus(offlineDevice, null)).toEqual({
            phase: 'public',
            title: '公网',
            tone: 'neutral',
            latencyMs: null,
        })
    })
})
