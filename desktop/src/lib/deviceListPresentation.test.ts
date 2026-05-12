import { describe, expect, it } from 'bun:test'
import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
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

describe('deviceListPresentation', () => {
    it('keeps the connected list aligned with the connected count semantics', () => {
        const connected = device({ id: 'connected', active: true })
        const recentOffline = device({ id: 'recent-offline', lastSeenAt: Date.now() })
        const revokedOnline = device({ id: 'revoked-online', active: true, revokedAt: Date.now() })

        expect(getConnectedDevices([connected, recentOffline, revokedOnline])).toEqual([connected])
    })
})
