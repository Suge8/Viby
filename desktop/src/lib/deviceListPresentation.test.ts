import { describe, expect, it } from 'bun:test'
import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import type { DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'
import type { DesktopPairingSession } from '@/types'
import { buildDevicePresentation, getConnectedDevices } from './deviceListPresentation'

function device(overrides: Partial<DeviceAuthDevice>): DeviceAuthDevice {
    return {
        id: overrides.id ?? 'device-1',
        name: null,
        platform: 'unknown',
        channel: 'scan',
        createdAt: 1,
        lastSeenAt: 1,
        revokedAt: null,
        active: false,
        ...overrides,
    }
}

const noLinks: DeviceLinkSnapshotMap = new Map()

function pairingSession(pairingId: string, approvalStatus: DesktopPairingSession['pairing']['approvalStatus']) {
    return {
        pairing: {
            id: pairingId,
            state: 'active',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            ticketExpiresAt: 9_999,
            shortCode: null,
            approvalStatus,
            host: {},
            guest: { label: 'iPhone', lastSeenAt: 3, metadata: { platform: 'ios' } },
        },
        hostToken: `host-${pairingId}`,
        pairingUrl: `https://example.test/p/${pairingId}`,
        wsUrl: `wss://example.test/ws/${pairingId}`,
        tunnelUrl: `wss://example.test/tunnel/${pairingId}`,
        iceServers: [],
    } satisfies DesktopPairingSession
}

describe('deviceListPresentation', () => {
    it('counts link/local devices from hub active state', () => {
        const connected = device({ id: 'connected', channel: 'link', active: true })
        const recentOffline = device({ id: 'recent-offline', channel: 'link', lastSeenAt: Date.now() })
        const revokedOnline = device({ id: 'revoked-online', channel: 'link', active: true, revokedAt: Date.now() })
        expect(getConnectedDevices([connected, recentOffline, revokedOnline], noLinks)).toEqual([connected])
    })

    it('counts scan devices only when their bridge is ready', () => {
        const ready = device({ id: 'pairing:ready', channel: 'scan', active: false })
        const connecting = device({ id: 'pairing:connecting', channel: 'scan', active: true })
        const links: DeviceLinkSnapshotMap = new Map([
            ['pairing:ready', { deviceId: 'pairing:ready', phase: 'ready', stats: null }],
            ['pairing:connecting', { deviceId: 'pairing:connecting', phase: 'connecting', stats: null }],
        ])
        expect(getConnectedDevices([ready, connecting], links)).toEqual([ready])
    })

    it('projects approved scan pairings before Hub device rows arrive', () => {
        const links: DeviceLinkSnapshotMap = new Map([
            ['pairing:ready', { deviceId: 'pairing:ready', phase: 'ready', stats: null }],
        ])
        const devices = buildDevicePresentation(
            [],
            [pairingSession('ready', 'approved'), pairingSession('pending', 'pending')]
        )

        expect(devices).toMatchObject([{ id: 'pairing:ready', name: 'iPhone', platform: 'ios', channel: 'scan' }])
        expect(getConnectedDevices(devices, links).map((row) => row.id)).toEqual(['pairing:ready'])
    })

    it('keeps browser and installed PWA handoff under the same scan device row', () => {
        const staleBrowserRow = device({
            id: 'pairing:phone',
            name: 'Browser tab',
            platform: 'unknown',
            channel: 'scan',
        })
        const links: DeviceLinkSnapshotMap = new Map([
            ['pairing:phone', { deviceId: 'pairing:phone', phase: 'ready', stats: null }],
        ])
        const devices = buildDevicePresentation([staleBrowserRow], [pairingSession('phone', 'approved')])

        expect(devices).toEqual([
            expect.objectContaining({ id: 'pairing:phone', name: 'iPhone', platform: 'ios', channel: 'scan' }),
        ])
        expect(getConnectedDevices(devices, links).map((row) => row.id)).toEqual(['pairing:phone'])
    })
})
