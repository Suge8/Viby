import { DevicePlatformSchema } from '@viby/protocol/deviceAuth'
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { getOrCreateOwnerId } from '../../config/ownerId'
import { configuration } from '../../configuration'
import type { DeviceAuthStore } from '../../store/deviceAuthStore'
import { parseAccessToken } from '../../utils/accessToken'
import { constantTimeEquals } from '../../utils/crypto'
import type { WebAppEnv } from '../middleware/auth'
import { createAuthFailureRateLimiter } from './authRateLimit'
import { createJsonBodyValidator } from './sessionRouteSupport'

const accessTokenAuthSchema = z.object({
    accessToken: z.string(),
    platform: DevicePlatformSchema.optional(),
    deviceName: z.string().trim().min(1).max(80).optional(),
})

const authBodySchema = accessTokenAuthSchema

export function createAuthRoutes(jwtSecret: Uint8Array, devices?: DeviceAuthStore): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    const enforceAuthFailureRateLimit = createAuthFailureRateLimiter()

    app.post('/auth', createJsonBodyValidator(authBodySchema), async (c) => {
        const body = c.req.valid('json')
        const parsedToken = parseAccessToken(body.accessToken)
        if (!parsedToken || !constantTimeEquals(parsedToken, configuration.hubOwnerToken)) {
            const rateLimitResponse = enforceAuthFailureRateLimit(c)
            if (rateLimitResponse) return rateLimitResponse
            return c.json({ error: 'Invalid access token' }, 401)
        }

        const userId = await getOrCreateOwnerId()
        const localDevice = devices?.touchLocalDevice({
            anchorId: String(userId),
            name: body.deviceName,
            platform: body.platform,
            channel: 'local',
        })

        const token = await new SignJWT({ uid: userId, ...(localDevice ? { did: localDevice.id } : {}) })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('4h')
            .sign(jwtSecret)

        return c.json({
            token,
            user: {
                id: userId,
                firstName: 'Web User',
            },
        })
    })

    return app
}
