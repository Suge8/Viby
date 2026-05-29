import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { LanPairingSessionStore } from '../../pairing/lanSessionStore'
import { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import { createAuthMiddleware } from '../middleware/auth'
import { createLanPairingHostRoutes, createLanPairingPublicRoutes } from './lanPairing'

const jwtSecret = new TextEncoder().encode('lan-pairing-test-secret-lan-pairing-test-secret')
const HOST_ORIGIN = 'http://192.168.1.10:37173'
const OWNER_ID = 42

async function signHostToken(): Promise<string> {
    return await new SignJWT({ uid: OWNER_ID })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(jwtSecret)
}

function buildApp(): { app: Hono<WebAppEnv>; sessions: LanPairingSessionStore; store: Store } {
    const sessions = new LanPairingSessionStore()
    const store = new Store(':memory:')
    const options = { sessions, devices: store.devices, jwtSecret, getOwnerId: async () => OWNER_ID }

    const app = new Hono<WebAppEnv>()
    // Public verify-code is mounted before auth middleware.
    app.route('/api', createLanPairingPublicRoutes(options))
    app.use('/api/lan-pairings/*', async (c, next) => {
        // events endpoint validates its own token via query string.
        if (c.req.path.endsWith('/events')) return await next()
        return await createAuthMiddleware(jwtSecret)(c, next)
    })
    app.use('/api/lan-pairings', createAuthMiddleware(jwtSecret))
    app.route('/api', createLanPairingHostRoutes(options))
    return { app, sessions, store }
}

async function createInvite(app: Hono<WebAppEnv>, hostToken: string): Promise<Record<string, unknown>> {
    const response = await app.request(`${HOST_ORIGIN}/api/lan-pairings`, {
        method: 'POST',
        headers: { authorization: `Bearer ${hostToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Phone' }),
    })
    expect(response.status).toBe(200)
    return (await response.json()) as Record<string, unknown>
}

describe('LAN pairing routes', () => {
    it('creates a LAN pairing invite the host can share with the same hub host', async () => {
        const { app } = buildApp()
        const hostToken = await signHostToken()
        const invite = (await createInvite(app, hostToken)) as {
            pairing: { id: string; shortCode: string }
            pairingUrl: string
            eventsUrl: string
        }

        expect(invite.pairingUrl).toBe(`${HOST_ORIGIN}/p/${invite.pairing.id}`)
        expect(invite.eventsUrl).toBe(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}/events`)
        expect(invite.pairing.shortCode).toMatch(/^\d{6}$/)
    })

    it('verifies the LAN code, writes a device row, and returns a fresh JWT', async () => {
        const { app, store } = buildApp()
        const hostToken = await signHostToken()
        const invite = (await createInvite(app, hostToken)) as { pairing: { id: string; shortCode: string } }

        const verifyResponse = await app.request(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: invite.pairing.shortCode,
                label: 'Pixel',
                publicKey: 'spki-key',
                deviceName: 'Pixel 9',
                platform: 'android',
            }),
        })
        expect(verifyResponse.status).toBe(200)
        const verified = (await verifyResponse.json()) as {
            deviceToken: string
            deviceId: string
            deviceSecret: string
        }

        expect(verified.deviceToken).toBeTruthy()
        expect(verified.deviceSecret).toBeTruthy()
        expect(verified.deviceId).toBeTruthy()
        const stored = store.devices.getDevice(verified.deviceId)
        expect(stored?.platform).toBe('android')
        expect(stored?.channel).toBe('link')
    })

    it('rejects a wrong code with 403 invalid_pairing_code and leaves the session unclaimed', async () => {
        const { app, sessions } = buildApp()
        const hostToken = await signHostToken()
        const invite = (await createInvite(app, hostToken)) as { pairing: { id: string } }

        const response = await app.request(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: '000000', label: 'Phone' }),
        })
        expect(response.status).toBe(403)
        const payload = (await response.json()) as { code: string }
        expect(payload.code).toBe('invalid_pairing_code')

        const snapshot = sessions.getSnapshotForOwner(invite.pairing.id, OWNER_ID)
        expect(snapshot?.approvalStatus).toBeNull()
        expect(snapshot?.guest).toBeNull()
    })

    it('refuses DELETE from another hub owner so a foreign user cannot drop the session', async () => {
        const { app } = buildApp()
        const hostToken = await signHostToken()
        const invite = (await createInvite(app, hostToken)) as { pairing: { id: string } }

        const foreignToken = await new SignJWT({ uid: 99 })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(jwtSecret)
        const denied = await app.request(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${foreignToken}` },
        })
        expect(denied.status).toBe(404)

        const allowed = await app.request(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${hostToken}` },
        })
        expect(allowed.status).toBe(200)
    })

    it('streams an initial pairing.updated snapshot and the post-verify approval over SSE', async () => {
        const { app } = buildApp()
        const hostToken = await signHostToken()
        const invite = (await createInvite(app, hostToken)) as { pairing: { id: string; shortCode: string } }

        const eventsResponse = await app.request(
            `${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}/events?token=${hostToken}`
        )
        expect(eventsResponse.status).toBe(200)
        expect(eventsResponse.headers.get('content-type')).toContain('text/event-stream')

        const reader = eventsResponse.body!.getReader()
        const decoder = new TextDecoder()
        async function readUntil(predicate: (chunk: string) => boolean, budgetMs = 1_000): Promise<string> {
            const startedAt = Date.now()
            let buffer = ''
            while (!predicate(buffer)) {
                if (Date.now() - startedAt > budgetMs) throw new Error(`SSE budget exceeded: ${buffer}`)
                const { value, done } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
            }
            return buffer
        }

        const initial = await readUntil((chunk) => chunk.includes('event: pairing.updated'))
        expect(initial).toContain('"approvalStatus":null')

        await app.request(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: invite.pairing.shortCode, label: 'Phone' }),
        })

        const afterVerify = await readUntil((chunk) => chunk.includes('"approvalStatus":"approved"'))
        expect(afterVerify).toContain('"approvalStatus":"approved"')

        await reader.cancel()
    })

    it('refuses SSE access when the events query token is missing or invalid', async () => {
        const { app } = buildApp()
        const hostToken = await signHostToken()
        const invite = (await createInvite(app, hostToken)) as { pairing: { id: string } }

        const missing = await app.request(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}/events`)
        expect(missing.status).toBe(401)

        const bogus = await app.request(`${HOST_ORIGIN}/api/lan-pairings/${invite.pairing.id}/events?token=not-a-jwt`)
        expect(bogus.status).toBe(401)
    })
})
