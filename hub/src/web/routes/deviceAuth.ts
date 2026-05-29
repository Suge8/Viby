import { randomBytes } from 'node:crypto'
import type { Hono } from 'hono'
import { Hono as HonoApp } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { getOrCreateOwnerId } from '../../config/ownerId'
import type { DeviceAuthStore } from '../../store/deviceAuthStore'
import type { WebAppEnv } from '../middleware/auth'
import { createDeviceAuthRateLimiter } from './deviceAuthRateLimit'
import { createJsonBodyValidator } from './sessionRouteSupport'

const reconnectSchema = z.object({
    deviceId: z.string().uuid(),
    secret: z.string().min(32).max(256),
})

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

function isActiveDevice(
    device: { id: string; channel: string | null; revokedAt: number | null },
    activeIds: Set<string>
): boolean {
    if (device.revokedAt !== null || device.channel === 'scan') return false
    return activeIds.has(device.id)
}

export function createDeviceAuthRoutes(
    jwtSecret: Uint8Array,
    devices: DeviceAuthStore,
    options: {
        protectedRoutes?: boolean
        getActiveDeviceIds?: () => Set<string>
    } = {}
): Hono<WebAppEnv> {
    const app = new HonoApp<WebAppEnv>()
    const enforceRateLimit = createDeviceAuthRateLimiter()

    if (!options.protectedRoutes) {
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
        if (deviceId.startsWith('pairing:')) return c.json({ deleted: devices.deletePairingDevice(deviceId) })
        return c.json({ revoked: devices.revokeDevice(deviceId) })
    })

    return app
}
