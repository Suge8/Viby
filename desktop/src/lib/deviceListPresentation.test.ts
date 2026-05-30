import { describe, expect, it } from 'bun:test'
import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
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

function pairingSession(pairingId: string, connectionCount = 1) {
    return {
        pairing: {
            id: pairingId,
            state: 'active',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            shortCode: null,
            approvalStatus: 'approved',
            host: {},
            guest: { label: 'iPhone', lastSeenAt: 3, metadata: { platform: 'ios' } },
            remoteConnections: Array.from({ length: connectionCount }, (_, index) => ({
                id: `${pairingId}-${index}`,
                connectedAt: index === 0 ? 4 : undefined,
                createdAt: 3,
                lastSeenAt: 4,
            })),
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
        expect(getConnectedDevices([connected, recentOffline, revokedOnline])).toEqual([connected])
    })

    it('counts scan devices from broker remote connection state first', () => {
        const ready = {
            ...device({ id: 'pairing:ready', channel: 'scan', active: false }),
            remoteConnections: [{ id: 'tab', connectedAt: 1, createdAt: 1, lastSeenAt: 1 }],
        }
        const connecting = device({ id: 'pairing:connecting', channel: 'scan', active: true })
        expect(getConnectedDevices([ready, connecting])).toEqual([ready])
    })

    it('projects scan pairings from broker remote connection contract', () => {
        const devices = buildDevicePresentation([], [pairingSession('ready'), pairingSession('pending', 0)])

        expect(devices.map((row) => row.id)).toEqual(['pairing:ready'])
        expect(getConnectedDevices(devices).map((row) => row.id)).toEqual(['pairing:ready'])
    })

    it('keeps browser and installed PWA handoff under the same scan device row', () => {
        const staleBrowserRow = device({
            id: 'pairing:phone',
            name: 'Browser tab',
            platform: 'unknown',
            channel: 'scan',
        })
        const devices = buildDevicePresentation([staleBrowserRow], [pairingSession('phone', 2)])

        expect(devices).toEqual([
            expect.objectContaining({
                id: 'pairing:phone',
                name: 'iPhone',
                platform: 'ios',
                channel: 'scan',
                remoteConnections: expect.arrayContaining([expect.objectContaining({ id: 'phone-0' })]),
            }),
        ])
        expect(getConnectedDevices(devices).map((row) => row.id)).toEqual(['pairing:phone'])
    })
})
