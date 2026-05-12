import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { DevicePresenceTracker } from '../../socket/devicePresence'
import { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import { createDeviceAuthRoutes } from './deviceAuth'

const jwtSecret = new TextEncoder().encode('device-auth-test-secret-device-auth-test-secret')

function createProtectedApp(store: Store, presence: DevicePresenceTracker): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    app.route(
        '/api',
        createDeviceAuthRoutes(jwtSecret, store.devices, {
            protectedRoutes: true,
            getActiveDeviceIds: () => presence.activeDeviceIds(),
        })
    )
    return app
}

describe('deviceAuth routes', () => {
    it('returns active count from link/local presence and ignores revoked rows', async () => {
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

        const response = await createProtectedApp(store, presence).request('/api/device-auth/devices')

        expect(response.status).toBe(200)
        const body = (await response.json()) as { activeCount: number; devices: unknown[] }
        expect(body.activeCount).toBe(1)
        expect(body.devices).toEqual([
            expect.objectContaining({ id: tablet.id, active: false, revokedAt: 3 }),
            expect.objectContaining({ id: phone.id, active: true, revokedAt: null, channel: 'link' }),
        ])
    })

    it('keeps scan device metadata but never marks scan rows active from hub presence', async () => {
        const store = new Store(':memory:')
        store.devices.bindPairingDevice({ pairingId: 'pairing-1', name: 'Phone', platform: 'ios', channel: 'scan' })
        const presence = new DevicePresenceTracker()
        expect(presence.add('pairing:pairing-1', 'socket-1')).toBe(false)

        const listed = await createProtectedApp(store, presence).request('/api/device-auth/devices')

        expect(await listed.json()).toMatchObject({
            activeCount: 0,
            devices: [
                expect.objectContaining({
                    id: 'pairing:pairing-1',
                    name: 'Phone',
                    platform: 'ios',
                    channel: 'scan',
                    active: false,
                }),
            ],
        })
    })

    it('DELETE on a pairing device hard-deletes the scan row', async () => {
        const store = new Store(':memory:')
        store.devices.bindPairingDevice({ pairingId: 'pairing-1', channel: 'scan' })
        const deleted = await createProtectedApp(store, new DevicePresenceTracker()).request(
            '/api/device-auth/devices/pairing:pairing-1',
            { method: 'DELETE' }
        )
        expect(deleted.status).toBe(200)
        expect(await deleted.json()).toEqual({ deleted: true })
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

        const app = createProtectedApp(store, presence)
        const revoked = await app.request(`/api/device-auth/devices/${phone.id}`, { method: 'DELETE' })
        expect(revoked.status).toBe(200)
        expect(await revoked.json()).toEqual({ revoked: true })

        const body = (await (await app.request('/api/device-auth/devices')).json()) as {
            activeCount: number
            devices: unknown[]
        }
        expect(body.activeCount).toBe(0)
        expect(body.devices).toEqual([
            expect.objectContaining({ id: phone.id, active: false, revokedAt: expect.any(Number) }),
        ])
    })
})
