import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { getOrCreateOwnerId } from '../../config/ownerId'
import { configuration } from '../../configuration'
import { parseAccessToken } from '../../utils/accessToken'
import { constantTimeEquals } from '../../utils/crypto'
import type { WebAppEnv } from '../middleware/auth'
import { createJsonBodyValidator } from './sessionRouteSupport'

const accessTokenAuthSchema = z.object({
    accessToken: z.string(),
})

const authBodySchema = accessTokenAuthSchema

export function createAuthRoutes(jwtSecret: Uint8Array): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/auth', createJsonBodyValidator(authBodySchema), async (c) => {
        const parsedToken = parseAccessToken(c.req.valid('json').accessToken)
        if (!parsedToken || !constantTimeEquals(parsedToken, configuration.cliApiToken)) {
            return c.json({ error: 'Invalid access token' }, 401)
        }

        const userId = await getOrCreateOwnerId()

        const token = await new SignJWT({ uid: userId })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('15m')
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
