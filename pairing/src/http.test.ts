import { describe, expect, it } from 'bun:test'
import { webcrypto } from 'node:crypto'
import { readPairingTicketFromUrl } from '@viby/protocol/pairing'
import { createBunWebSocket } from 'hono/bun'
import { buildPairingDeviceProofPayload } from './crypto'
import { createPairingApp } from './http'
import { PairingMetrics } from './metrics'
import { PairingRateLimiter } from './rateLimit'
import { MemoryPairingStore } from './store'
import { PairingSocketHub } from './ws'

const subtle = webcrypto.subtle

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return new Uint8Array(bytes).buffer
}

function createTestApp(overrides?: {
    now?: () => number
    metrics?: PairingMetrics
    rateLimiter?: PairingRateLimiter
    rateLimitRules?: {
        create: { bucket: string; limit: number; windowMs: number }
        claim: { bucket: string; limit: number; windowMs: number }
        reconnect: { bucket: string; limit: number; windowMs: number }
        approve: { bucket: string; limit: number; windowMs: number }
    }
}) {
    const store = new MemoryPairingStore(() => 1_700_000_000_000)
    const socketHub = new PairingSocketHub({ store, now: () => 1_700_000_000_000 })
    const { upgradeWebSocket } = createBunWebSocket()

    return createPairingApp({
        store,
        socketHub,
        publicUrl: 'https://pair.example.com',
        sessionTtlSeconds: 3600,
        ticketTtlSeconds: 600,
        reconnectChallengeTtlSeconds: 60,
        stunUrls: ['stun:stun.example.com:3478'],
        turnGenerator: null,
        createToken: 'create-secret',
        upgradeWebSocket,
        metrics: overrides?.metrics,
        rateLimiter: overrides?.rateLimiter,
        rateLimitRules: overrides?.rateLimitRules,
        now: overrides?.now ?? (() => 1_700_000_000_000),
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

describe('pairing http routes', () => {
    it('creates, claims, reconnects, and deletes a pairing session', async () => {
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
        expect(created.pairingUrl).toBe(
            'https://pair.example.com/p/' +
                created.pairing.id +
                '#ticket=' +
                encodeURIComponent(readPairingTicketFromUrl(created.pairingUrl)!)
        )
        expect(created.wsUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/ws?token=${created.hostToken}`
        )

        const ticket = readPairingTicketFromUrl(created.pairingUrl)
        expect(ticket).toBeTruthy()
        const guestIdentity = await createReconnectDeviceIdentity()

        const claimResponse = await app.request(`/pairings/${created.pairing.id}/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                ticket,
                label: 'Phone Guest',
                publicKey: guestIdentity.publicKey,
            }),
        })
        expect(claimResponse.status).toBe(200)
        const claimed = await claimResponse.json()
        expect(claimed.guestToken).toBeTruthy()
        expect(claimed.wsUrl).toContain(`/pairings/${created.pairing.id}/ws?token=`)
        expect(claimed.pairing.approvalStatus).toBe('pending')
        expect(claimed.pairing.shortCode).toMatch(/^\d{6}$/)

        const approveResponse = await app.request(`/pairings/${created.pairing.id}/approve`, {
            method: 'POST',
            headers: { authorization: `Bearer ${created.hostToken}` },
        })
        expect(approveResponse.status).toBe(200)
        const approved = await approveResponse.json()
        expect(approved.pairing.approvalStatus).toBe('approved')
        expect(approved.pairing.shortCode).toBe(claimed.pairing.shortCode)

        const challengeResponse = await app.request(`/pairings/${created.pairing.id}/reconnect-challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: claimed.guestToken }),
        })
        expect(challengeResponse.status).toBe(200)
        const challenge = await challengeResponse.json()
        const deviceProof = await createReconnectDeviceProof(
            created.pairing.id,
            guestIdentity,
            challenge.challenge.nonce
        )

        const reconnectResponse = await app.request(`/pairings/${created.pairing.id}/reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                token: claimed.guestToken,
                challengeNonce: challenge.challenge.nonce,
                deviceProof,
            }),
        })
        expect(reconnectResponse.status).toBe(200)
        const reconnected = await reconnectResponse.json()
        expect(reconnected.role).toBe('guest')
        expect(reconnected.pairing.approvalStatus).toBe('approved')
        expect(reconnected.wsUrl).toBe(
            `wss://pair.example.com/pairings/${created.pairing.id}/ws?token=${claimed.guestToken}`
        )

        const deleteResponse = await app.request(`/pairings/${created.pairing.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${created.hostToken}` },
        })
        expect(deleteResponse.status).toBe(200)
        const deleted = await deleteResponse.json()
        expect(deleted.deleted).toBe(true)
        expect(deleted.pairing.state).toBe('deleted')
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
        const ticket = readPairingTicketFromUrl(created.pairingUrl)

        const claimResponse = await app.request(`/pairings/${created.pairing.id}/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticket, label: 'Phone Guest', publicKey: deviceIdentity.publicKey }),
        })
        const claimed = await claimResponse.json()

        const approveResponse = await app.request(`/pairings/${created.pairing.id}/approve`, {
            method: 'POST',
            headers: { authorization: `Bearer ${created.hostToken}` },
        })
        expect(approveResponse.status).toBe(200)

        const reconnectResponse = await app.request(`/pairings/${created.pairing.id}/reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: claimed.guestToken }),
        })

        expect(reconnectResponse.status).toBe(403)
        expect(await reconnectResponse.json()).toMatchObject({
            error: 'Missing or invalid device proof',
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
        const ticket = readPairingTicketFromUrl(created.pairingUrl)
        const deviceIdentity = await createReconnectDeviceIdentity()
        const deviceProof = await createReconnectDeviceProof(created.pairing.id, deviceIdentity, 'missing-challenge')

        const claimResponse = await app.request(`/pairings/${created.pairing.id}/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticket, label: 'Phone Guest', publicKey: deviceIdentity.publicKey }),
        })
        const claimed = await claimResponse.json()

        await app.request(`/pairings/${created.pairing.id}/approve`, {
            method: 'POST',
            headers: { authorization: `Bearer ${created.hostToken}` },
        })

        const reconnectResponse = await app.request(`/pairings/${created.pairing.id}/reconnect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                token: claimed.guestToken,
                challengeNonce: 'missing-challenge',
                deviceProof,
            }),
        })

        expect(reconnectResponse.status).toBe(403)
        expect(await reconnectResponse.json()).toMatchObject({
            error: 'Missing or expired reconnect challenge',
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

    it('serves the pairing landing page at /p/:id', async () => {
        const app = createTestApp()
        const response = await app.request('/p/pairing-123')

        expect(response.status).toBe(200)
        const html = await response.text()
        expect(html).toContain('手机接过来。会话继续跑。')
        expect(html).toContain('pairing-123')
        expect(html).toContain('自动重连')
        expect(html).toContain('会话列表')
    })

    it('rate limits repeated claim attempts from the same client address', async () => {
        const app = createTestApp({
            rateLimiter: new PairingRateLimiter(),
            rateLimitRules: {
                create: { bucket: 'create', limit: 30, windowMs: 60_000 },
                claim: { bucket: 'claim', limit: 1, windowMs: 60_000 },
                reconnect: { bucket: 'reconnect', limit: 60, windowMs: 60_000 },
                approve: { bucket: 'approve', limit: 30, windowMs: 60_000 },
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
        const ticket = readPairingTicketFromUrl(created.pairingUrl)

        const firstClaim = await app.request(`/pairings/${created.pairing.id}/claim`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({ ticket, label: 'Phone Guest' }),
        })
        expect(firstClaim.status).toBe(200)

        const secondClaim = await app.request(`/pairings/${created.pairing.id}/claim`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '203.0.113.10',
            },
            body: JSON.stringify({ ticket: 'another-ticket', label: 'Retry Guest' }),
        })
        expect(secondClaim.status).toBe(429)
        expect(secondClaim.headers.get('retry-after')).toBeTruthy()
        expect(await secondClaim.json()).toMatchObject({
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
        })
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
                    transport: 'relay',
                    localCandidateType: 'relay',
                    remoteCandidateType: 'relay',
                    currentRoundTripTimeMs: 88,
                    restartCount: 2,
                    sampledAt: 1_700_000_000_500,
                },
            }),
        })

        expect(telemetryResponse.status).toBe(200)

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
                    relay: 1,
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
        const ticket = readPairingTicketFromUrl(created.pairingUrl)

        const claimResponse = await app.request(`/pairings/${created.pairing.id}/claim`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticket, label: 'Phone Guest' }),
        })
        const claimed = await claimResponse.json()

        const telemetryResponse = await app.request(`/pairings/${created.pairing.id}/telemetry`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${claimed.guestToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                sample: {
                    source: 'desktop',
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'host',
                    currentRoundTripTimeMs: 12,
                    restartCount: 0,
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
                claim_requests: 1,
                telemetry_rejected: 1,
            },
            telemetry: {
                totalReports: 0,
            },
        })
    })
})
