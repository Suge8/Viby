import { describe, expect, it } from 'bun:test'
import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import type { DesktopPairingSession } from '@/types'
import { buildDevicePresentation, getConnectedDevices, getInactivePairingIds } from './deviceListPresentation'

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
    it('keeps Hub auth rows out of the remote device count', () => {
        const connected = device({ id: 'connected', channel: 'link', active: true })
        const local = device({ id: 'local', channel: 'local', active: true })

        expect(buildDevicePresentation([connected, local], [])).toEqual([])
    })

    it('counts scan devices from broker remote connection state first', () => {
        const ready = {
            ...device({ id: 'pairing:ready', channel: 'scan', active: false }),
            remoteConnections: [{ id: 'tab', connectedAt: 1, createdAt: 1, lastSeenAt: 1 }],
        }
        const connecting = device({ id: 'pairing:connecting', channel: 'scan', active: true })
        expect(getConnectedDevices([ready, connecting])).toEqual([ready])
    })

    it('projects only online scan pairings from broker remote connection contract', () => {
        const devices = buildDevicePresentation([], [pairingSession('ready'), pairingSession('pending', 0)])

        expect(devices.map((row) => row.id)).toEqual(['pairing:ready'])
        expect(devices[0]?.remoteConnections).toEqual([expect.objectContaining({ id: 'ready-0' })])
        expect(getConnectedDevices(devices).map((row) => row.id)).toEqual(['pairing:ready'])
    })

    it('hides pairings whose broker windows are all offline', () => {
        const offline = pairingSession('offline', 1)
        offline.pairing.remoteConnections = offline.pairing.remoteConnections?.map((connection) => ({
            ...connection,
            connectedAt: undefined,
        }))

        expect(buildDevicePresentation([], [offline])).toEqual([])
    })

    it('ignores stale Hub scan rows even when the local row still says active', () => {
        const staleScan = device({ id: 'pairing:stale', channel: 'scan', active: true })

        expect(buildDevicePresentation([staleScan], [])).toEqual([])
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

    it('identifies stored pairings with no online broker window for cleanup', () => {
        const offline = pairingSession('offline', 1)
        offline.pairing.remoteConnections = offline.pairing.remoteConnections?.map((connection) => ({
            ...connection,
            connectedAt: undefined,
        }))

        expect(getInactivePairingIds([pairingSession('ready'), offline, pairingSession('pending', 0)])).toEqual([
            'offline',
            'pending',
        ])
    })
})
