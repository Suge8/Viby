import { describe, expect, it } from 'bun:test'
import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import type { DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'
import { getConnectedDevices } from './deviceListPresentation'

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
})
