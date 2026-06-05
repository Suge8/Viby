import { afterEach, describe, expect, it } from 'bun:test'
import { webcrypto } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROTOCOL_VERSION, WEB_BUILD_METADATA_FILE_NAME } from '@viby/protocol'
import { PairingBrokerTunnelMessageSchema } from '@viby/protocol/pairing'
import { createBunWebSocket } from 'hono/bun'
import { buildPairingDeviceProofPayload, hashPairingSecret } from './crypto'
import { createPairingApp } from './http'
import { createPairingManifestCookieSigner } from './manifestCookie'
import { PairingMetrics } from './metrics'
import { PairingRateLimiter } from './rateLimit'
import { PairingSessionEventBus } from './sessionEventBus'
import { MemoryPairingStore } from './store'
import { PairingSocketHub, type PairingSocketLike } from './ws'

const subtle = webcrypto.subtle
const tempRoots: string[] = []

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return new Uint8Array(bytes).buffer
}

type RateLimitRuleConfig = { bucket: string; limit: number; windowMs: number }

function socket(): PairingSocketLike {
    return {
        readyState: 1,
        send() {},
        close() {},
    }
}

function trackedSocket(): PairingSocketLike & { closed: Array<{ code?: number; reason?: string }> } {
    return {
        readyState: 1,
        closed: [],
        send() {},
        close(code?: number, reason?: string) {
            this.closed.push({ code, reason })
        },
    }
}

function createTestApp(overrides?: {
    now?: () => number
    metrics?: PairingMetrics
    rateLimiter?: PairingRateLimiter
    rateLimitRules?: {
        create: RateLimitRuleConfig
        verify: RateLimitRuleConfig
        reconnect: RateLimitRuleConfig
        handoffClaim: RateLimitRuleConfig
    }
    webApp?: { indexHtml?: string; assetsRoot?: string }
    manifestCookieSigner?: ReturnType<typeof createPairingManifestCookieSigner>
    manifestCookieTtlSeconds?: number
    logger?: Pick<Console, 'debug' | 'error' | 'info' | 'log' | 'warn'>
    store?: MemoryPairingStore
    socketHub?: PairingSocketHub
    tunnelHub?: PairingSocketHub
    eventBus?: PairingSessionEventBus
}) {
    const now = overrides?.now ?? (() => 1_700_000_000_000)
    const store = overrides?.store ?? new MemoryPairingStore(now)
    const socketHub = overrides?.socketHub ?? new PairingSocketHub({ store, now })
    const tunnelHub =
        overrides?.tunnelHub ?? new PairingSocketHub({ store, now, messageSchema: PairingBrokerTunnelMessageSchema })
    const eventBus = overrides?.eventBus ?? new PairingSessionEventBus()
    const { upgradeWebSocket } = createBunWebSocket()

    return createPairingApp({
        store,
        socketHub,
        tunnelHub,
        eventBus,
        publicUrl: 'https://pair.example.com',
        sessionTtlSeconds: 3600,
        handoffTicketTtlSeconds: 600,
        reconnectChallengeTtlSeconds: 60,
        stunUrls: ['stun:stun.example.com:3478'],
        createToken: 'create-secret',
        upgradeWebSocket,
        logger: overrides?.logger,
        metrics: overrides?.metrics,
        rateLimiter: overrides?.rateLimiter,
        rateLimitRules: overrides?.rateLimitRules,
        now,
        manifestCookieSigner: overrides?.manifestCookieSigner ?? createPairingManifestCookieSigner(),
        manifestCookieTtlSeconds: overrides?.manifestCookieTtlSeconds ?? 1800,
        webApp: overrides?.webApp ?? {
            indexHtml:
                '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>',
        },
    })
}

async function createReconnectDeviceIdentity() {
    const keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const [publicKey, privateKey] = await Promise.all([
        subtle.exportKey('spki', keyPair.publicKey),
        subtle.exportKey('jwk', keyPair.privateKey),
    ])

    return {
        publicKey: Buffer.from(publicKey).toString('base64url'),
        privateKey,
    }
}

async function createReconnectDeviceProof(
    pairingId: string,
    identity: Awaited<ReturnType<typeof createReconnectDeviceIdentity>>,
    challengeNonce: string
) {
    const signedAt = 1_700_000_000_000
    const importedPrivateKey = await subtle.importKey(
        'jwk',
        identity.privateKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    )
    const signature = await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        importedPrivateKey,
        toArrayBuffer(buildPairingDeviceProofPayload(pairingId, challengeNonce, signedAt))
    )

    return {
        publicKey: identity.publicKey,
        challengeNonce,
        signedAt,
        signature: Buffer.from(signature).toString('base64url'),
    }
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true })
    }
})

describe('pairing http routes', () => {
    it('reports readiness through the store owner', async () => {
        const response = await createTestApp().request('/ready')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true, service: 'pairing', store: 'ready' })
    })

    it('serves the normal Web app for phone pairing links', async () => {
        const app = createTestApp()

        const response = await app.request('/p/pairing-web')
        expect(response.status).toBe(200)
        const html = await response.text()

        expect(html).toContain('id="root"')
        expect(html).toContain('/assets/index.js')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('pragma')).toBe('no-cache')
        expect(response.headers.get('expires')).toBe('0')
        expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength(html)))
        expect(html).not.toContain('id="sessionList"')
        expect(html).not.toContain('id="composer"')
    })

    it('does not expose a manifest link during PWA handoff launch so iOS cannot rotate the one-shot ticket before React consumes it', async () => {
        const app = createTestApp({
            webApp: {
                indexHtml:
                    '<!doctype html><html><head><link rel="manifest" crossorigin="use-credentials" href="/manifest.webmanifest"></head><body><div id="root"></div></body></html>',
            },
        })

        const installResponse = await app.request('/p/pairing-web')
        expect(await installResponse.text()).toContain('/manifest.webmanifest?pairing=pairing-web')

        const launchResponse = await app.request('/p/pairing-web?handoff=handoff-ticket')
        const launchHtml = await launchResponse.text()
        expect(launchHtml).toContain('id="root"')
        expect(launchHtml).not.toContain('rel="manifest"')
        expect(launchResponse.headers.get('cache-control')).toBe('no-store')
        expect(launchResponse.headers.get('content-length')).toBe(String(Buffer.byteLength(launchHtml)))
    })

    it('serves Web assets with cache headers and byte length', async () => {
        const assetsRoot = mkdtempSync(join(tmpdir(), 'viby-pairing-http-assets-'))
        tempRoots.push(assetsRoot)
        mkdirSync(join(assetsRoot, 'assets'))
        writeFileSync(join(assetsRoot, 'web-index.html'), '<!doctype html>')
        writeFileSync(join(assetsRoot, 'assets', 'index.js'), 'console.log("ok")')
        const app = createTestApp({ webApp: { assetsRoot } })

        const response = await app.request('/assets/index.js')

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
        expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength('console.log("ok")')))
    })

    it('serves Web build metadata as an unversioned asset that must revalidate', async () => {
        const assetsRoot = mkdtempSync(join(tmpdir(), 'viby-pairing-http-build-meta-'))
        tempRoots.push(assetsRoot)
        writeFileSync(join(assetsRoot, 'web-index.html'), '<!doctype html>')
        writeFileSync(join(assetsRoot, WEB_BUILD_METADATA_FILE_NAME), '{"buildId":"test"}')
        const app = createTestApp({ webApp: { assetsRoot } })

        const response = await app.request(`/${WEB_BUILD_METADATA_FILE_NAME}`)

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-cache')
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    })

    it('serves the service worker as an unversioned asset that must revalidate', async () => {
        const assetsRoot = mkdtempSync(join(tmpdir(), 'viby-pairing-http-sw-'))
        tempRoots.push(assetsRoot)
        writeFileSync(join(assetsRoot, 'web-index.html'), '<!doctype html>')
        writeFileSync(join(assetsRoot, 'sw.js'), 'self.skipWaiting()')
        const app = createTestApp({ webApp: { assetsRoot } })

        const response = await app.request('/sw.js')

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-cache')
        expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength('self.skipWaiting()')))
    })

    it('serves the Web app shell only for explicit remote workspace routes', async () => {
        const app = createTestApp()

        for (const path of [
            '/sessions?remote=1',
            '/sessions?Remote=1',
            '/sessions/session-1?remote=1',
            '/sessions/session-1/files?remote=1',
        ]) {
            const response = await app.request(path)

            expect(response.status).toBe(200)
            expect(response.headers.get('cache-control')).toBe('no-store')
            expect(await response.text()).toContain('id="root"')
        }
    })

    it('redirects naked workspace routes to the product site without loading the app shell', async () => {
        const app = createTestApp()

        for (const path of ['/sessions', '/sessions/session-1']) {
            const response = await app.request(path, { redirect: 'manual' })

            expect(response.status).toBe(302)
            expect(response.headers.get('location')).toBe('https://viby.run')
            expect(response.headers.get('cache-control')).toBe('no-store')
        }
    })

    it('creates, verifies, reconnects, renews, and deletes a pairing session', async () => {
        let now = 1_700_000_000_000
        const store = new MemoryPairingStore(() => now)
        const socketHub = new PairingSocketHub({ store, now: () => now })
        const tunnelHub = new PairingSocketHub({ store, now: () => now, messageSchema: PairingBrokerTunnelMessageSchema })
        const app = createTestApp({ store, socketHub, tunnelHub, now: () => now })

        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        expect(createResponse.status).toBe(200)
        const created = await createResponse.json()
        expect(created.pairingUrl).toBe(`https://pair.example.com/p/${created.pairing.id}`)
        expect(created.wsUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/ws?token=${created.hostToken}`
        )
        expect(created.tunnelUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/tunnel?token=${created.hostToken}`
        )
        expect(created.eventsUrl).toBe(
            `https://pair.example.com/pairings/${created.pairing.id}/events?token=${created.hostToken}`
        )
        expect(created.pairing.shortCode).toMatch(/^\d{6}$/)
        expect(created.pairing.approvalStatus).toBeNull()

        const guestIdentity = await createReconnectDeviceIdentity()

        const wrongCodeResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: '000000', label: 'Phone Guest', publicKey: guestIdentity.publicKey }),
        })
        expect(wrongCodeResponse.status).toBe(403)

        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Phone Guest',
                publicKey: guestIdentity.publicKey,
            }),
        })
        expect(verifyResponse.status).toBe(200)
        const verified = await verifyResponse.json()
        expect(verified.guestToken).toBeTruthy()
        expect(verified.wsUrl).toContain(`/pairings/${created.pairing.id}/ws?token=`)
        expect(verified.tunnelUrl).toContain(`/pairings/${created.pairing.id}/tunnel?token=`)
        expect(verified.pairing.approvalStatus).toBe('approved')
        expect(verified.pairing.shortCode).toBe(created.pairing.shortCode)

        const replayResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Other Phone',
                publicKey: guestIdentity.publicKey,
            }),
        })
        expect(replayResponse.status).toBe(409)

        const challengeResponse = await app.request(`/pairings/${created.pairing.id}/reconnect-challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken }),
        })
        expect(challengeResponse.status).toBe(200)
        const challenge = await challengeResponse.json()
        const deviceProof = await createReconnectDeviceProof(
            created.pairing.id,
            guestIdentity,
            challenge.challenge.nonce
        )

        now += 1_000
        const reconnectResponse = await app.request(`/pairings/${created.pairing.id}/reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                token: verified.guestToken,
                challengeNonce: challenge.challenge.nonce,
                deviceProof,
            }),
        })
        expect(reconnectResponse.status).toBe(200)
        const reconnected = await reconnectResponse.json()
        expect(reconnected.role).toBe('guest')
        expect(reconnected.pairing.approvalStatus).toBe('approved')
        expect(reconnected.pairing.expiresAt).toBeGreaterThan(created.pairing.expiresAt)
        expect(reconnected.wsUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/ws?token=${verified.guestToken}`
        )
        expect(reconnected.tunnelUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/tunnel?token=${verified.guestToken}`
        )
        const oldWsSocket = trackedSocket()
        const oldTunnelSocket = trackedSocket()
        await socketHub.attach(created.pairing.id, hashPairingSecret(verified.guestToken), oldWsSocket)
        await tunnelHub.attach(created.pairing.id, hashPairingSecret(verified.guestToken), oldTunnelSocket)

        const deviceChallengeResponse = await app.request(
            `/pairings/${created.pairing.id}/device-reconnect-challenge`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ publicKey: guestIdentity.publicKey }),
            }
        )
        expect(deviceChallengeResponse.status).toBe(200)
        const deviceChallenge = await deviceChallengeResponse.json()
        const recoveryProof = await createReconnectDeviceProof(
            created.pairing.id,
            guestIdentity,
            deviceChallenge.challenge.nonce
        )

        const deviceReconnectResponse = await app.request(`/pairings/${created.pairing.id}/device-reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ deviceProof: recoveryProof }),
        })
        expect(deviceReconnectResponse.status).toBe(200)
        const deviceRecovered = await deviceReconnectResponse.json()
        expect(deviceRecovered.guestToken).toBeTruthy()
        expect(deviceRecovered.guestToken).not.toBe(verified.guestToken)
        expect(deviceRecovered.wsUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/ws?token=${deviceRecovered.guestToken}`
        )
        expect(deviceRecovered.tunnelUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/tunnel?token=${deviceRecovered.guestToken}`
        )
        expect(oldWsSocket.closed).toContainEqual({ code: 1012, reason: 'replaced' })
        expect(oldTunnelSocket.closed).toContainEqual({ code: 1012, reason: 'replaced' })

        const staleBrowserTokenResponse = await app.request(`/pairings/${created.pairing.id}/reconnect-challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken }),
        })
        expect(staleBrowserTokenResponse.status).toBe(403)
        expect(await staleBrowserTokenResponse.json()).toMatchObject({ code: 'pairing_invalid_token' })

        const deleteResponse = await app.request(`/pairings/${created.pairing.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${created.hostToken}` },
        })
        expect(deleteResponse.status).toBe(200)
        const deleted = await deleteResponse.json()
        expect(deleted.deleted).toBe(true)
        expect(deleted.pairing.state).toBe('deleted')
    })

    it('hands an approved browser pairing to a freshly installed PWA once', async () => {
        const now = () => 1_700_000_000_000
        const store = new MemoryPairingStore(now)
        const socketHub = new PairingSocketHub({ store, now })
        const tunnelHub = new PairingSocketHub({ store, now, messageSchema: PairingBrokerTunnelMessageSchema })
        const app = createTestApp({ store, socketHub, tunnelHub, now })
        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: { authorization: 'Bearer create-secret', 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const browserIdentity = await createReconnectDeviceIdentity()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Phone Browser',
                publicKey: browserIdentity.publicKey,
            }),
        })
        const verified = await verifyResponse.json()
        const oldWsSocket = trackedSocket()
        const oldTunnelSocket = trackedSocket()
        await socketHub.attach(created.pairing.id, hashPairingSecret(verified.guestToken), oldWsSocket)
        await tunnelHub.attach(created.pairing.id, hashPairingSecret(verified.guestToken), oldTunnelSocket)

        const challengeResponse = await app.request(`/pairings/${created.pairing.id}/reconnect-challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken }),
        })
        const challenge = await challengeResponse.json()
        const deviceProof = await createReconnectDeviceProof(
            created.pairing.id,
            browserIdentity,
            challenge.challenge.nonce
        )
        const handoffTicketResponse = await app.request(`/pairings/${created.pairing.id}/pwa-handoff-ticket`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken, deviceProof }),
        })
        expect(handoffTicketResponse.status).toBe(200)
        const handoff = await handoffTicketResponse.json()
        expect(handoff.handoffTicket).toBeTruthy()

        const secondChallengeResponse = await app.request(`/pairings/${created.pairing.id}/reconnect-challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken }),
        })
        const secondChallenge = await secondChallengeResponse.json()
        const secondProof = await createReconnectDeviceProof(
            created.pairing.id,
            browserIdentity,
            secondChallenge.challenge.nonce
        )
        const newerHandoffResponse = await app.request(`/pairings/${created.pairing.id}/pwa-handoff-ticket`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken, deviceProof: secondProof }),
        })
        expect(newerHandoffResponse.status).toBe(200)

        const pwaIdentity = await createReconnectDeviceIdentity()
        const handoffClaimResponse = await app.request(`/pairings/${created.pairing.id}/pwa-handoff-claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                handoffTicket: handoff.handoffTicket,
                label: 'Phone PWA',
                publicKey: pwaIdentity.publicKey,
            }),
        })
        expect(handoffClaimResponse.status).toBe(200)
        const handoffClaimed = await handoffClaimResponse.json()
        expect(handoffClaimed.pairing.authorizedDevice.publicKey).toBe(browserIdentity.publicKey)
        expect(handoffClaimed.guestToken).toBeTruthy()
        expect(handoffClaimed.guestToken).not.toBe(verified.guestToken)
        expect(handoffClaimed.wsUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/ws?token=${handoffClaimed.guestToken}`
        )
        expect(handoffClaimed.tunnelUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/tunnel?token=${handoffClaimed.guestToken}`
        )
        expect(oldWsSocket.closed).toContainEqual({ code: 1012, reason: 'replaced' })
        expect(oldTunnelSocket.closed).toContainEqual({ code: 1012, reason: 'replaced' })

        const reusedHandoffResponse = await app.request(`/pairings/${created.pairing.id}/pwa-handoff-claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ handoffTicket: handoff.handoffTicket, publicKey: browserIdentity.publicKey }),
        })
        expect(reusedHandoffResponse.status).toBe(403)
        expect(await reusedHandoffResponse.json()).toMatchObject({ code: 'pairing_invalid_handoff_ticket' })

        const staleBrowserTokenResponse = await app.request(`/pairings/${created.pairing.id}/reconnect-challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken }),
        })
        expect(staleBrowserTokenResponse.status).toBe(403)
        expect(await staleBrowserTokenResponse.json()).toMatchObject({ code: 'pairing_invalid_token' })
    })

    it('returns only STUN ICE servers with every broker-issued ICE response', async () => {
        const app = createTestApp()

        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        expect(createResponse.status).toBe(200)
        const created = await createResponse.json()
        expect(created.iceServers).toEqual([{ urls: 'stun:stun.example.com:3478' }])

        const deviceIdentity = await createReconnectDeviceIdentity()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Phone Guest',
                publicKey: deviceIdentity.publicKey,
            }),
        })
        expect(verifyResponse.status).toBe(200)
        const verified = await verifyResponse.json()
        expect(verified.iceServers).toEqual(created.iceServers)

        const challengeResponse = await app.request(`/pairings/${created.pairing.id}/reconnect-challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken }),
        })
        const challenge = await challengeResponse.json()
        const deviceProof = await createReconnectDeviceProof(
            created.pairing.id,
            deviceIdentity,
            challenge.challenge.nonce
        )
        const reconnectResponse = await app.request(`/pairings/${created.pairing.id}/reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                token: verified.guestToken,
                challengeNonce: challenge.challenge.nonce,
                deviceProof,
            }),
        })
        expect(reconnectResponse.status).toBe(200)
        const reconnected = await reconnectResponse.json()
        expect(reconnected.iceServers).toEqual(created.iceServers)
    })

    it('rejects guest reconnect when the signed device proof is missing for a bound device', async () => {
        const app = createTestApp()
        const deviceIdentity = await createReconnectDeviceIdentity()

        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Phone Guest',
                publicKey: deviceIdentity.publicKey,
            }),
        })
        const verified = await verifyResponse.json()
        const reconnectResponse = await app.request(`/pairings/${created.pairing.id}/reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: verified.guestToken }),
        })

        expect(reconnectResponse.status).toBe(403)
        expect(await reconnectResponse.json()).toMatchObject({
            code: 'pairing_invalid_device_proof',
        })
    })

    it('rejects guest reconnect when the reconnect challenge has not been issued', async () => {
        const app = createTestApp()

        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const deviceIdentity = await createReconnectDeviceIdentity()
        const deviceProof = await createReconnectDeviceProof(created.pairing.id, deviceIdentity, 'missing-challenge')

        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Phone Guest',
                publicKey: deviceIdentity.publicKey,
            }),
        })
        const verified = await verifyResponse.json()
        const reconnectResponse = await app.request(`/pairings/${created.pairing.id}/reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                token: verified.guestToken,
                challengeNonce: 'missing-challenge',
                deviceProof,
            }),
        })

        expect(reconnectResponse.status).toBe(403)
        expect(await reconnectResponse.json()).toMatchObject({
            code: 'pairing_reconnect_challenge_expired',
        })
    })

    it('requires a create token when configured', async () => {
        const app = createTestApp()

        const response = await app.request('/pairings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        })

        expect(response.status).toBe(401)
    })

    it('exposes protocol compatibility on health checks', async () => {
        const app = createTestApp()
        const response = await app.request('/health')

        expect(await response.json()).toMatchObject({ ok: true, service: 'pairing', protocolVersion: PROTOCOL_VERSION })
    })

    it('emits a structured request log line for non-health requests so production journals show each PWA install fetch in sequence', async () => {
        const lines: string[] = []
        const app = createTestApp({
            logger: {
                debug: () => {},
                error: () => {},
                info: (...args: unknown[]) => {
                    lines.push(args.map((arg) => String(arg)).join(' '))
                },
                log: () => {},
                warn: () => {},
            },
        })

        await app.request('/health')
        await app.request('/manifest.webmanifest', {
            headers: { 'user-agent': 'iPhone CriOS test', cookie: 'viby_pair_manifest=fake' },
        })
        await app.request('/p/pairing-web?handoff=secret-ticket')

        expect(lines.some((line) => line.includes('/health'))).toBe(false)
        const manifestLine = lines.find((line) => line.includes('/manifest.webmanifest'))
        expect(manifestLine).toBeDefined()
        expect(manifestLine).toContain('cookie=yes')
        expect(manifestLine).toContain('iPhone CriOS test')
        expect(lines.find((line) => line.includes('/p/pairing-web'))).toContain('handoff=%3Credacted%3E')
        expect(lines.find((line) => line.includes('/p/pairing-web'))).not.toContain('secret-ticket')
    })

    it('serves the shared brand logo asset', async () => {
        const app = createTestApp()
        const response = await app.request('/brand-logo-tight.png')

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('image/png')
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1024)
    })

    it('returns the current pairing snapshot for an authorized participant', async () => {
        const app = createTestApp()
        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()

        const statusResponse = await app.request(`/pairings/${created.pairing.id}`, {
            headers: {
                authorization: `Bearer ${created.hostToken}`,
            },
        })

        expect(statusResponse.status).toBe(200)
        expect(await statusResponse.json()).toMatchObject({
            pairing: {
                id: created.pairing.id,
                approvalStatus: null,
            },
            remoteConnections: [],
        })
    })

    it('keeps guest presence online when only the relay tunnel drops', async () => {
        const now = () => 1_700_000_000_000
        const store = new MemoryPairingStore(now)
        const socketHub = new PairingSocketHub({ store, now })
        const tunnelHub = new PairingSocketHub({
            store,
            now,
            messageSchema: PairingBrokerTunnelMessageSchema,
            trackRemoteConnectionLiveness: false,
        })
        const app = createTestApp({ socketHub, store, tunnelHub, now })
        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: { authorization: 'Bearer create-secret', 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: created.pairing.shortCode, label: 'Phone Guest', publicKey: 'phone-key' }),
        })
        const verified = await verifyResponse.json()
        const guestSocket = socket()
        const relaySocket = socket()

        const guestTokenHash = hashPairingSecret(verified.guestToken)
        await socketHub.attach(created.pairing.id, guestTokenHash, guestSocket)
        await tunnelHub.attach(created.pairing.id, guestTokenHash, relaySocket)
        await tunnelHub.detach(relaySocket)
        const statusResponse = await app.request(`/pairings/${created.pairing.id}`, {
            headers: { authorization: `Bearer ${created.hostToken}` },
        })

        expect(statusResponse.status).toBe(200)
        const status = await statusResponse.json()
        expect(status.remoteConnections[0]).toMatchObject({ connectedAt: now() })
    })

    it('does not expose persisted remote connection liveness after broker restart', async () => {
        const now = () => 1_700_000_000_000
        const store = new MemoryPairingStore(now)
        const app = createTestApp({ store, now })
        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: { authorization: 'Bearer create-secret', 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: created.pairing.shortCode, label: 'Phone Guest', publicKey: 'phone-key' }),
        })
        expect(verifyResponse.status).toBe(200)
        const [connection] = await store.getRemoteConnections(created.pairing.id)
        await store.markRemoteConnectionConnected(created.pairing.id, connection.connectionId, now())

        const restartedApp = createTestApp({ store, now })
        const statusResponse = await restartedApp.request(`/pairings/${created.pairing.id}`, {
            headers: { authorization: `Bearer ${created.hostToken}` },
        })

        expect(statusResponse.status).toBe(200)
        const status = await statusResponse.json()
        expect(status.remoteConnections[0]).toMatchObject({ id: connection.id })
        expect(status.remoteConnections[0]).not.toHaveProperty('connectedAt')
    })

    it('rate limits repeated verify-code attempts from the same client address', async () => {
        const app = createTestApp({
            rateLimiter: new PairingRateLimiter(),
            rateLimitRules: {
                create: { bucket: 'create', limit: 30, windowMs: 60_000 },
                verify: { bucket: 'verify', limit: 1, windowMs: 60_000 },
                reconnect: { bucket: 'reconnect', limit: 60, windowMs: 60_000 },
                handoffClaim: { bucket: 'handoffClaim', limit: 30, windowMs: 60_000 },
            },
        })

        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()

        const firstVerify = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Phone Guest',
                publicKey: 'browser-public-key',
            }),
        })
        expect(firstVerify.status).toBe(200)

        const secondVerify = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({ code: '000000', label: 'Retry Guest', publicKey: 'retry-public-key' }),
        })
        expect(secondVerify.status).toBe(429)
        expect(secondVerify.headers.get('retry-after')).toBeTruthy()
        expect(await secondVerify.json()).toMatchObject({
            code: 'pairing_rate_limited',
        })
    })

    it('exposes broker counters on /metrics when the create token is present', async () => {
        const metrics = new PairingMetrics(1_700_000_000_000)
        const app = createTestApp({ metrics })

        await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })

        const metricsResponse = await app.request('/metrics', {
            headers: {
                authorization: 'Bearer create-secret',
            },
        })

        expect(metricsResponse.status).toBe(200)
        expect(await metricsResponse.json()).toMatchObject({
            counters: {
                create_requests: 1,
            },
            websocket: {
                activeSessions: 0,
                activeSockets: 0,
                pairedSessions: 0,
            },
        })
    })

    it('answers telemetry CORS preflight for desktop WebViews', async () => {
        const app = createTestApp()

        const response = await app.request('/pairings/pairing-1/telemetry', {
            method: 'OPTIONS',
            headers: {
                origin: 'tauri://localhost',
                'access-control-request-headers': 'authorization, content-type',
                'access-control-request-method': 'POST',
            },
        })

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe('*')
        expect(response.headers.get('access-control-allow-methods')).toContain('POST')
        expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
    })

    it('records host telemetry samples in the broker metrics snapshot', async () => {
        const metrics = new PairingMetrics(1_700_000_000_000)
        const app = createTestApp({ metrics })

        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()

        const telemetryResponse = await app.request(`/pairings/${created.pairing.id}/telemetry`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${created.hostToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                sample: {
                    source: 'desktop',
                    transport: 'direct',
                    transportMode: 'direct-webrtc',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 88,
                    restartCount: 2,
                    routeRevision: 1,
                    directBlockedReason: 'turn-candidate',
                    sampledAt: 1_700_000_000_500,
                },
            }),
        })

        expect(telemetryResponse.status).toBe(200)
        expect(telemetryResponse.headers.get('access-control-allow-origin')).toBe('*')

        const metricsResponse = await app.request('/metrics', {
            headers: {
                authorization: 'Bearer create-secret',
            },
        })

        expect(await metricsResponse.json()).toMatchObject({
            counters: {
                create_requests: 1,
                telemetry_reports: 1,
            },
            telemetry: {
                totalReports: 1,
                transportCounts: {
                    direct: 1,
                },
                transportModeCounts: {
                    'direct-webrtc': 1,
                },
                directBlockedReasonCounts: {
                    'turn-candidate': 1,
                },
                maxRestartCount: 2,
                averageRoundTripTimeMs: 88,
            },
        })
    })

    it('rejects guest telemetry reports and does not count them as accepted telemetry', async () => {
        const metrics = new PairingMetrics(1_700_000_000_000)
        const app = createTestApp({ metrics })

        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: {
                authorization: 'Bearer create-secret',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: created.pairing.shortCode,
                label: 'Phone Guest',
                publicKey: 'browser-public-key',
            }),
        })
        const verified = await verifyResponse.json()

        const telemetryResponse = await app.request(`/pairings/${created.pairing.id}/telemetry`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${verified.guestToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                sample: {
                    source: 'desktop',
                    transport: 'direct',
                    transportMode: 'direct-webrtc',
                    localCandidateType: 'host',
                    remoteCandidateType: 'host',
                    currentRoundTripTimeMs: 12,
                    restartCount: 0,
                    routeRevision: 0,
                    directBlockedReason: null,
                    sampledAt: 1_700_000_000_500,
                },
            }),
        })

        expect(telemetryResponse.status).toBe(403)

        const metricsResponse = await app.request('/metrics', {
            headers: {
                authorization: 'Bearer create-secret',
            },
        })

        expect(await metricsResponse.json()).toMatchObject({
            counters: {
                create_requests: 1,
                verify_requests: 1,
                telemetry_rejected: 1,
            },
            telemetry: {
                totalReports: 0,
            },
        })
    })

    it('rejects DELETE /pairings/:id when the caller is a guest, not the host', async () => {
        const app = createTestApp()
        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: { authorization: 'Bearer create-secret', 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: created.pairing.shortCode, label: 'Phone', publicKey: 'browser-public-key' }),
        })
        const verified = await verifyResponse.json()

        const guestDelete = await app.request(`/pairings/${created.pairing.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${verified.guestToken}` },
        })
        expect(guestDelete.status).toBe(403)

        const hostDelete = await app.request(`/pairings/${created.pairing.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${created.hostToken}` },
        })
        expect(hostDelete.status).toBe(200)
    })

    it('pushes pairing.updated to host SSE subscribers when verify-code approves the session', async () => {
        const app = createTestApp()
        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: { authorization: 'Bearer create-secret', 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()

        const eventsResponse = await app.request(`/pairings/${created.pairing.id}/events`, {
            headers: { authorization: `Bearer ${created.hostToken}` },
        })
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

        // Initial snapshot: state pre-verify.
        const initial = await readUntil((chunk) => chunk.includes('event: pairing.updated'))
        expect(initial).toContain('"approvalStatus":null')

        // Trigger verify-code, then expect the SSE stream to emit the approved snapshot.
        await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: created.pairing.shortCode, label: 'Phone', publicKey: 'browser-public-key' }),
        })
        const afterVerify = await readUntil((chunk) => chunk.includes('"approvalStatus":"approved"'))
        expect(afterVerify).toContain('"approvalStatus":"approved"')
        expect(afterVerify).toContain('"remoteConnections"')
        expect(afterVerify).toContain('"lastSeenAt"')

        await reader.cancel()
    })

    it('refuses the SSE events stream to guest tokens', async () => {
        const app = createTestApp()
        const createResponse = await app.request('/pairings', {
            method: 'POST',
            headers: { authorization: 'Bearer create-secret', 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Desk Host' }),
        })
        const created = await createResponse.json()
        const verifyResponse = await app.request(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: created.pairing.shortCode, label: 'Phone', publicKey: 'browser-public-key' }),
        })
        const verified = await verifyResponse.json()

        const guestEvents = await app.request(`/pairings/${created.pairing.id}/events`, {
            headers: { authorization: `Bearer ${verified.guestToken}` },
        })
        expect(guestEvents.status).toBe(403)
    })
})
