import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { DevicePresenceTracker } from '../../socket/devicePresence'
import { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import { createDeviceAuthRoutes, type PairingPresenceSink } from './deviceAuth'

const jwtSecret = new TextEncoder().encode('device-auth-test-secret-device-auth-test-secret')

function buildPresenceSink(presence: DevicePresenceTracker): PairingPresenceSink {
    return {
        set: (deviceId, alive) => {
            if (alive) presence.add(deviceId, 'pairing-bridge')
            else presence.remove(deviceId, 'pairing-bridge')
        },
    }
}

describe('deviceAuth routes', () => {
    it('returns active count purely from presence membership, ignoring revoked rows', async () => {
        const store = new Store(':memory:')
        const phone = store.devices.bindDevice({
            secret: 'phone-secret-phone-secret-phone-secret',
            channel: 'link',
            now: 1,
        })
        const tablet = store.devices.bindDevice({
            secret: 'tablet-secret-tablet-secret-tablet-secret',
            channel: 'link',
            now: 2,
        })
        store.devices.revokeDevice(tablet.id, 3)
        const presence = new DevicePresenceTracker()
        presence.add(phone.id, 'socket-1')
        presence.add(tablet.id, 'socket-2')

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createDeviceAuthRoutes(jwtSecret, store.devices, {
                protectedRoutes: true,
                getActiveDeviceIds: () => presence.activeDeviceIds(),
            })
        )

        const response = await app.request('/api/device-auth/devices')

        expect(response.status).toBe(200)
        const body = (await response.json()) as { activeCount: number; devices: unknown[] }
        expect(body.activeCount).toBe(1)
        expect(body.devices).toEqual([
            expect.objectContaining({ id: tablet.id, active: false, revokedAt: 3 }),
            expect.objectContaining({ id: phone.id, active: true, revokedAt: null, channel: 'link' }),
        ])
    })

    it('pairing-presence alive=true registers a scan device and presence flips active to true', async () => {
        const store = new Store(':memory:')
        const presence = new DevicePresenceTracker()
        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createDeviceAuthRoutes(jwtSecret, store.devices, {
                protectedRoutes: true,
                getActiveDeviceIds: () => presence.activeDeviceIds(),
                pairingPresence: buildPresenceSink(presence),
            })
        )

        const reported = await app.request('/api/device-auth/pairing-presence', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pairingId: 'pairing-1', alive: true, deviceName: 'Phone', platform: 'ios' }),
        })
        expect(reported.status).toBe(200)

        const listed = await app.request('/api/device-auth/devices')
        expect(await listed.json()).toMatchObject({
            activeCount: 1,
            devices: [
                expect.objectContaining({
                    id: 'pairing:pairing-1',
                    name: 'Phone',
                    platform: 'ios',
                    channel: 'scan',
                    active: true,
                }),
            ],
        })
    })

    it('pairing-presence alive=false removes presence without dropping the row', async () => {
        const store = new Store(':memory:')
        const presence = new DevicePresenceTracker()
        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createDeviceAuthRoutes(jwtSecret, store.devices, {
                protectedRoutes: true,
                getActiveDeviceIds: () => presence.activeDeviceIds(),
                pairingPresence: buildPresenceSink(presence),
            })
        )

        await app.request('/api/device-auth/pairing-presence', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pairingId: 'pairing-1', alive: true, platform: 'ios' }),
        })
        await app.request('/api/device-auth/pairing-presence', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pairingId: 'pairing-1', alive: false }),
        })

        const listed = await app.request('/api/device-auth/devices')
        expect(await listed.json()).toMatchObject({
            activeCount: 0,
            devices: [expect.objectContaining({ id: 'pairing:pairing-1', active: false })],
        })
    })

    it('DELETE on a pairing device hard-deletes the row and drops presence', async () => {
        const store = new Store(':memory:')
        const presence = new DevicePresenceTracker()
        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createDeviceAuthRoutes(jwtSecret, store.devices, {
                protectedRoutes: true,
                getActiveDeviceIds: () => presence.activeDeviceIds(),
                pairingPresence: buildPresenceSink(presence),
            })
        )

        await app.request('/api/device-auth/pairing-presence', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pairingId: 'pairing-1', alive: true }),
        })

        const deleted = await app.request('/api/device-auth/devices/pairing:pairing-1', { method: 'DELETE' })
        expect(deleted.status).toBe(200)
        expect(await deleted.json()).toEqual({ deleted: true })

        // presence membership is gone and the row is hard-removed
        expect(presence.activeDeviceIds().has('pairing:pairing-1')).toBe(false)
        expect(store.devices.listDevices()).toHaveLength(0)
    })

    it('DELETE on a link device performs a soft revoke so secret reconnect can be denied', async () => {
        const store = new Store(':memory:')
        const presence = new DevicePresenceTracker()
        const phone = store.devices.bindDevice({
            secret: 'phone-secret-phone-secret-phone-secret',
            channel: 'link',
            now: 1,
        })
        presence.add(phone.id, 'socket-1')

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createDeviceAuthRoutes(jwtSecret, store.devices, {
                protectedRoutes: true,
                getActiveDeviceIds: () => presence.activeDeviceIds(),
                pairingPresence: buildPresenceSink(presence),
            })
        )

        const revoked = await app.request(`/api/device-auth/devices/${phone.id}`, { method: 'DELETE' })
        expect(revoked.status).toBe(200)
        expect(await revoked.json()).toEqual({ revoked: true })

        const listed = await app.request('/api/device-auth/devices')
        const body = (await listed.json()) as { activeCount: number; devices: unknown[] }
        // row stays as tombstone but is no longer counted as active
        expect(body.activeCount).toBe(0)
        expect(body.devices).toEqual([
            expect.objectContaining({ id: phone.id, active: false, revokedAt: expect.any(Number) }),
        ])
    })
})
