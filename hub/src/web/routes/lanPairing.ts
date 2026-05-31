import { randomBytes } from 'node:crypto'
import { DevicePlatformSchema } from '@viby/protocol/deviceAuth'
import {
    PairingCreateRequestSchema,
    PairingLanCreateResponseSchema,
    PairingLanVerifyCodeResponseSchema,
    PairingStatusResponseSchema,
    toPairingSessionSnapshot,
} from '@viby/protocol/pairing'
import type { Context, Hono } from 'hono'
import { Hono as HonoApp } from 'hono'
import { jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'
import type { LanPairingSessionStore } from '../../pairing/lanSessionStore'
import type { DeviceAuthStore } from '../../store/deviceAuthStore'
import type { WebAppEnv } from '../middleware/auth'
import { createDeviceAuthRateLimiter } from './deviceAuthRateLimit'
import { createJsonBodyValidator } from './sessionRouteSupport'

const SSE_KEEPALIVE_INTERVAL_MS = 25_000

const LanVerifyCodeBodySchema = z.object({
    code: z.string().regex(/^\d{6}$/),
    label: PairingCreateRequestSchema.shape.label,
    publicKey: z.string().min(1).optional(),
    metadata: PairingCreateRequestSchema.shape.metadata,
    deviceName: z.string().trim().min(1).max(80).optional(),
    platform: DevicePlatformSchema.optional(),
})

type LanVerifyCodeBody = z.infer<typeof LanVerifyCodeBodySchema>

interface JwtPayload {
    uid: number
}

const jwtPayloadSchema = z.object({ uid: z.number() })

function createDeviceSecret(): string {
    return randomBytes(32).toString('base64url')
}

async function signDeviceSession(jwtSecret: Uint8Array, userId: number, deviceId: string): Promise<string> {
    return await new SignJWT({ uid: userId, did: deviceId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(jwtSecret)
}

async function verifyHostJwt(token: string, jwtSecret: Uint8Array): Promise<JwtPayload | null> {
    try {
        const verified = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] })
        const parsed = jwtPayloadSchema.safeParse(verified.payload)
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

function deriveBaseUrlFromRequest(c: Context<WebAppEnv>): string {
    return new URL('/', c.req.url).toString().replace(/\/$/, '')
}

function buildLanInviteUrl(baseUrl: string, pairingId: string): string {
    return new URL(`/p/${pairingId}`, baseUrl).toString()
}

function buildLanEventsUrl(baseUrl: string, pairingId: string): string {
    return new URL(`/api/lan-pairings/${pairingId}/events`, baseUrl).toString()
}

interface LanPairingRoutesOptions {
    sessions: LanPairingSessionStore
    devices: DeviceAuthStore
    jwtSecret: Uint8Array
    getOwnerId: () => Promise<number>
}

/**
 * LAN pairing routes — Google device-flow, no broker. Public verify-code
 * accepts the 6-digit short code; everything else requires the desktop owner
 * (validated by hub JWT). Mounted in two phases so the verify-code endpoint
 * bypasses the JWT auth middleware while host-side ops stay protected.
 */
export function createLanPairingPublicRoutes(options: LanPairingRoutesOptions): Hono<WebAppEnv> {
    const app = new HonoApp<WebAppEnv>()
    const enforceRateLimit = createDeviceAuthRateLimiter()

    app.post('/lan-pairings/:id/verify-code', createJsonBodyValidator(LanVerifyCodeBodySchema), async (c) => {
        const rateLimited = enforceRateLimit(c)
        if (rateLimited) return rateLimited
        const pairingId = c.req.param('id')
        const body = c.req.valid('json') as LanVerifyCodeBody

        const verification = options.sessions.verifyAndApprove({
            pairingId,
            code: body.code,
            label: body.label,
            publicKey: body.publicKey,
            metadata: body.metadata,
        })

        if (verification.status === 'not_found') {
            return c.json({ error: 'Pairing session not found', code: 'pairing_not_found' }, 404)
        }
        if (verification.status === 'expired') {
            return c.json({ error: 'Pairing session expired', code: 'pairing_expired' }, 410)
        }
        if (verification.status === 'already_approved') {
            return c.json({ error: 'Pairing session already approved', code: 'pairing_already_approved' }, 409)
        }
        if (verification.status === 'wrong_code') {
            return c.json({ error: '数字不对，请看电脑上的 6 位数字', code: 'invalid_pairing_code' }, 403)
        }

        const session = verification.session!
        const deviceSecret = createDeviceSecret()
        const device = options.devices.bindDevice({
            secret: deviceSecret,
            name: body.deviceName ?? body.label ?? null,
            platform: body.platform ?? null,
            channel: 'link',
        })
        const ownerId = await options.getOwnerId()
        const token = await signDeviceSession(options.jwtSecret, ownerId, device.id)
        return c.json(
            PairingLanVerifyCodeResponseSchema.parse({
                pairing: toPairingSessionSnapshot(session),
                deviceToken: token,
                deviceId: device.id,
                deviceSecret,
            })
        )
    })

    return app
}

export function createLanPairingHostRoutes(options: LanPairingRoutesOptions): Hono<WebAppEnv> {
    const app = new HonoApp<WebAppEnv>()

    app.post('/lan-pairings', createJsonBodyValidator(PairingCreateRequestSchema), async (c) => {
        const ownerId = c.get('userId')
        const body = c.req.valid('json')
        const session = options.sessions.create({
            label: body.label,
            metadata: body.metadata,
            ownerId,
        })
        const baseUrl = deriveBaseUrlFromRequest(c)
        return c.json(
            PairingLanCreateResponseSchema.parse({
                pairing: toPairingSessionSnapshot(session),
                pairingUrl: buildLanInviteUrl(baseUrl, session.id),
                eventsUrl: buildLanEventsUrl(baseUrl, session.id),
            })
        )
    })

    app.get('/lan-pairings/:id', (c) => {
        const ownerId = c.get('userId')
        const snapshot = options.sessions.getSnapshotForOwner(c.req.param('id'), ownerId)
        if (!snapshot) {
            return c.json({ error: 'Pairing session not found', code: 'pairing_not_found' }, 404)
        }
        return c.json(PairingStatusResponseSchema.parse({ pairing: snapshot }))
    })

    app.delete('/lan-pairings/:id', (c) => {
        const ownerId = c.get('userId')
        const deleted = options.sessions.deleteForOwner(c.req.param('id'), ownerId)
        if (!deleted) {
            return c.json({ error: 'Pairing session not found', code: 'pairing_not_found' }, 404)
        }
        return c.json({ deleted: true, pairing: toPairingSessionSnapshot(deleted) })
    })

    app.get('/lan-pairings/:id/events', async (c) => {
        const pairingId = c.req.param('id')
        const ownerId = await resolveLanEventsOwner(c, options.jwtSecret)
        if (ownerId === null) {
            return c.json({ error: 'Missing or invalid pairing events token' }, 401)
        }
        if (!options.sessions.isOwnedBy(pairingId, ownerId)) {
            return c.json({ error: 'Pairing session not found', code: 'pairing_not_found' }, 404)
        }
        return streamLanPairingEvents(c, options, pairingId, ownerId)
    })

    return app
}

async function resolveLanEventsOwner(c: Context<WebAppEnv>, jwtSecret: Uint8Array): Promise<number | null> {
    const directOwner = c.get('userId')
    if (typeof directOwner === 'number') return directOwner
    const queryToken = c.req.query('token')
    if (!queryToken) return null
    const payload = await verifyHostJwt(queryToken, jwtSecret)
    return payload ? payload.uid : null
}

async function streamLanPairingEvents(
    c: Context<WebAppEnv>,
    options: LanPairingRoutesOptions,
    pairingId: string,
    ownerId: number
): Promise<Response> {
    const encoder = new TextEncoder()
    const initialSnapshot = options.sessions.getSnapshotForOwner(pairingId, ownerId)
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false
            let keepaliveId: ReturnType<typeof setInterval> | null = null
            let unsubscribe = () => {}

            const writeEvent = (eventName: string, data: string): void => {
                if (closed) return
                controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${data}\n\n`))
            }

            const close = (): void => {
                if (closed) return
                closed = true
                unsubscribe()
                if (keepaliveId) clearInterval(keepaliveId)
                controller.close()
            }

            if (initialSnapshot) {
                writeEvent('pairing.updated', JSON.stringify({ type: 'pairing.updated', pairing: initialSnapshot }))
            }

            unsubscribe = options.sessions.subscribe(pairingId, (event) => {
                writeEvent(event.type, JSON.stringify(event))
            })

            keepaliveId = setInterval(() => writeEvent('keepalive', ''), SSE_KEEPALIVE_INTERVAL_MS)
            c.req.raw.signal.addEventListener('abort', close, { once: true })
        },
    })

    return new Response(stream, {
        headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-store, must-revalidate',
            connection: 'keep-alive',
        },
    })
}
