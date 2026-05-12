import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBunWebSocket } from 'hono/bun'
import { createPairingApp } from './http'
import { createPairingManifestCookieSigner } from './manifestCookie'
import { MemoryPairingStore } from './memoryStore'
import { PairingSocketHub } from './ws'

const FIXED_NOW = 1_700_000_000_000
const COOKIE_SECRET = new Uint8Array(32).fill(13)
const tempRoots: string[] = []

function createWebRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'viby-pairing-pwa-recover-'))
    tempRoots.push(root)
    writeFileSync(join(root, 'web-index.html'), '<!doctype html><html><body></body></html>')
    writeFileSync(join(root, 'manifest.webmanifest'), JSON.stringify({ name: 'Viby', start_url: '/' }))
    return root
}

function buildTestApp() {
    const now = () => FIXED_NOW
    const store = new MemoryPairingStore(now)
    const socketHub = new PairingSocketHub({ store, now })
    const { upgradeWebSocket } = createBunWebSocket()
    const manifestCookieSigner = createPairingManifestCookieSigner({ secret: COOKIE_SECRET })
    const assetsRoot = createWebRoot()
    const app = createPairingApp({
        store,
        socketHub,
        publicUrl: 'https://pair.example.com',
        sessionTtlSeconds: 3600,
        ticketTtlSeconds: 600,
        reconnectChallengeTtlSeconds: 60,
        stunUrls: [],
        turnUrls: [],
        turnStaticAuthSecret: null,
        turnCredentialTtlSeconds: 600,
        createToken: null,
        upgradeWebSocket,
        now,
        manifestCookieSigner,
        manifestCookieTtlSeconds: 1800,
        webApp: { assetsRoot },
    })
    return { app, store, manifestCookieSigner }
}

async function seedApprovedPairing(store: MemoryPairingStore, pairingId: string): Promise<void> {
    await store.createSession({
        id: pairingId,
        state: 'waiting',
        approvalStatus: 'pending',
        shortCode: null,
        host: { tokenHash: 'host-hash', label: 'host', metadata: { source: 'desktop' } },
        guest: null,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        expiresAt: FIXED_NOW + 3600 * 1000,
        ticketExpiresAt: FIXED_NOW + 600 * 1000,
        ticketHash: 'ticket-hash',
    })
    await store.claimSession(
        pairingId,
        {
            tokenHash: 'guest-hash',
            label: 'guest',
            metadata: { platform: 'ios' },
            publicKey: 'guest-public-key',
            connectedAt: FIXED_NOW,
            lastSeenAt: FIXED_NOW,
        },
        '123456'
    )
    await store.approveSession(pairingId, FIXED_NOW)
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true })
    }
})

describe('GET /pairings/cookie-recover', () => {
    let app: ReturnType<typeof buildTestApp>['app']
    let store: MemoryPairingStore
    let manifestCookieSigner: ReturnType<typeof createPairingManifestCookieSigner>

    beforeEach(() => {
        ;({ app, store, manifestCookieSigner } = buildTestApp())
    })

    it('issues a fresh handoff ticket when the request carries a valid pairing cookie so the PWA can land inside the workspace within one round-trip', async () => {
        await seedApprovedPairing(store, 'pairing-1')
        const cookie = manifestCookieSigner.sign('pairing-1', FIXED_NOW + 1800 * 1000)

        const response = await app.request('/pairings/cookie-recover', {
            headers: { cookie: `viby_pair_manifest=${cookie}` },
        })

        expect(response.status).toBe(200)
        const payload = (await response.json()) as Record<string, unknown>
        expect(payload.pairingId).toBe('pairing-1')
        expect(typeof payload.handoffTicket).toBe('string')
        expect(typeof payload.expiresAt).toBe('number')
        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    it('returns `pairing_cookie_missing` when no cookie is sent so the PWA UI can immediately offer the re-scan path', async () => {
        const response = await app.request('/pairings/cookie-recover')
        expect(response.status).toBe(401)
        const payload = (await response.json()) as Record<string, unknown>
        expect(payload.code).toBe('pairing_cookie_missing')
    })

    it('returns `pairing_cookie_invalid` and clears the cookie when the signature does not match so a tampered cookie cannot get retried indefinitely', async () => {
        const response = await app.request('/pairings/cookie-recover', {
            headers: { cookie: 'viby_pair_manifest=pairing-1.999999999999.invalidmac' },
        })
        expect(response.status).toBe(401)
        const payload = (await response.json()) as Record<string, unknown>
        expect(payload.code).toBe('pairing_cookie_invalid')
        expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    })

    it('returns `pairing_unavailable` and clears the cookie when the bound pairing was torn down so a deleted pairing cannot keep issuing tickets', async () => {
        await seedApprovedPairing(store, 'pairing-1')
        await store.deleteSession('pairing-1', FIXED_NOW)
        const cookie = manifestCookieSigner.sign('pairing-1', FIXED_NOW + 1800 * 1000)

        const response = await app.request('/pairings/cookie-recover', {
            headers: { cookie: `viby_pair_manifest=${cookie}` },
        })
        expect(response.status).toBe(410)
        const payload = (await response.json()) as Record<string, unknown>
        expect(payload.code).toBe('pairing_unavailable')
        expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    })
})
