import { randomBytes } from 'node:crypto'
import { DevicePlatformSchema } from '@viby/protocol/deviceAuth'
import type { Hono } from 'hono'
import { Hono as HonoApp } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { getOrCreateOwnerId } from '../../config/ownerId'
import { configuration } from '../../configuration'
import type { DeviceAuthStore } from '../../store/deviceAuthStore'
import { constantTimeEquals } from '../../utils/crypto'
import type { WebAppEnv } from '../middleware/auth'
import { createDeviceAuthRateLimiter } from './deviceAuthRateLimit'
import { createJsonBodyValidator } from './sessionRouteSupport'

const verifyCodeSchema = z.object({
    code: z.string().regex(/^\d{6}$/),
    deviceName: z.string().trim().min(1).max(80).optional(),
    platform: DevicePlatformSchema.optional(),
})

const reconnectSchema = z.object({
    deviceId: z.string().uuid(),
    secret: z.string().min(32).max(256),
})

const pairingPresenceSchema = z.object({
    pairingId: z.string().trim().min(1).max(128),
    alive: z.boolean(),
    deviceName: z.string().trim().min(1).max(80).optional(),
    platform: DevicePlatformSchema.optional(),
})

export interface PairingPresenceSink {
    set(pairingDeviceId: string, alive: boolean): void
}

async function signSession(jwtSecret: Uint8Array, deviceId?: string) {
    const userId = await getOrCreateOwnerId()
    const token = await new SignJWT(deviceId ? { uid: userId, did: deviceId } : { uid: userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(jwtSecret)
    return { token, user: { id: userId, firstName: 'Web User' } }
}

function createSecret(): string {
    return randomBytes(32).toString('base64url')
}

function isActiveDevice(device: { id: string; revokedAt: number | null }, activeIds: Set<string>): boolean {
    if (device.revokedAt !== null) return false
    return activeIds.has(device.id)
}

export function createDeviceAuthRoutes(
    jwtSecret: Uint8Array,
    devices: DeviceAuthStore,
    options: {
        protectedRoutes?: boolean
        getActiveDeviceIds?: () => Set<string>
        pairingPresence?: PairingPresenceSink
    } = {}
): Hono<WebAppEnv> {
    const app = new HonoApp<WebAppEnv>()
    const enforceRateLimit = createDeviceAuthRateLimiter()

    if (!options.protectedRoutes) {
        app.post('/device-auth/code/verify', createJsonBodyValidator(verifyCodeSchema), async (c) => {
            const rateLimitResponse = enforceRateLimit(c)
            if (rateLimitResponse) return rateLimitResponse

            const { code, deviceName, platform } = c.req.valid('json')
            if (!constantTimeEquals(code, configuration.pairingCode)) {
                return c.json({ error: 'Invalid pairing code', code: 'invalid_pairing_code' }, 401)
            }

            const secret = createSecret()
            const device = devices.bindDevice({ secret, name: deviceName, platform, channel: 'link' })
            return c.json({ ...(await signSession(jwtSecret, device.id)), device: { id: device.id, secret } })
        })

        app.post('/device-auth/reconnect', createJsonBodyValidator(reconnectSchema), async (c) => {
            const rateLimitResponse = enforceRateLimit(c)
            if (rateLimitResponse) return rateLimitResponse

            const { deviceId, secret } = c.req.valid('json')
            const device = devices.verifyDevice(deviceId, secret)
            if (!device) return c.json({ error: 'Invalid device binding', code: 'invalid_device_binding' }, 401)
            return c.json({ ...(await signSession(jwtSecret, device.id)), device: { id: device.id } })
        })

        return app
    }

    app.post('/device-auth/pairing-presence', createJsonBodyValidator(pairingPresenceSchema), (c) => {
        const { pairingId, alive, deviceName, platform } = c.req.valid('json')
        const pairingDeviceId = `pairing:${pairingId}`
        if (alive) {
            const device = devices.bindPairingDevice({ pairingId, name: deviceName, platform, channel: 'scan' })
            if (!device) {
                options.pairingPresence?.set(pairingDeviceId, false)
                return c.json({ error: 'Pairing device is revoked', code: 'device_revoked' }, 410)
            }
            options.pairingPresence?.set(pairingDeviceId, true)
            return c.json({ device })
        }
        options.pairingPresence?.set(pairingDeviceId, false)
        return c.json({ ok: true })
    })

    app.get('/device-auth/devices', (c) => {
        const activeIds = options.getActiveDeviceIds?.() ?? new Set<string>()
        const listedDevices = devices.listDevices().map((device) => ({
            ...device,
            active: isActiveDevice(device, activeIds),
        }))
        const activeCount = listedDevices.filter((device) => device.active).length
        return c.json({ devices: listedDevices, activeCount })
    })

    app.delete('/device-auth/devices/:deviceId', (c) => {
        const deviceId = c.req.param('deviceId')
        if (deviceId.startsWith('pairing:')) {
            const deleted = devices.deletePairingDevice(deviceId)
            if (deleted) options.pairingPresence?.set(deviceId, false)
            return c.json({ deleted })
        }
        return c.json({ revoked: devices.revokeDevice(deviceId) })
    })

    return app
}
