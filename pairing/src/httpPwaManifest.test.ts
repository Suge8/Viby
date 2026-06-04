import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PairingBrokerTunnelMessageSchema } from '@viby/protocol/pairing'
import { createBunWebSocket } from 'hono/bun'
import { createPairingApp } from './http'
import { createPairingManifestCookieSigner } from './manifestCookie'
import { MemoryPairingStore } from './memoryStore'
import { PairingSessionEventBus } from './sessionEventBus'
import { PairingSocketHub } from './ws'

const FIXED_NOW = 1_700_000_000_000
const COOKIE_SECRET = new Uint8Array(32).fill(11)

const tempRoots: string[] = []

function createWebRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'viby-pairing-pwa-manifest-'))
    tempRoots.push(root)
    writeFileSync(join(root, 'web-index.html'), '<!doctype html><html><body><div id="root"></div></body></html>')
    writeFileSync(
        join(root, 'manifest.webmanifest'),
        JSON.stringify({
            name: 'Viby',
            short_name: 'Viby',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            icons: [],
        })
    )
    return root
}

function buildTestApp() {
    const now = () => FIXED_NOW
    const store = new MemoryPairingStore(now)
    const socketHub = new PairingSocketHub({ store, now })
    const tunnelHub = new PairingSocketHub({ store, now, messageSchema: PairingBrokerTunnelMessageSchema })
    const eventBus = new PairingSessionEventBus()
    const { upgradeWebSocket } = createBunWebSocket()
    const manifestCookieSigner = createPairingManifestCookieSigner({ secret: COOKIE_SECRET })
    const assetsRoot = createWebRoot()
    const app = createPairingApp({
        store,
        socketHub,
        tunnelHub,
        eventBus,
        publicUrl: 'https://pair.example.com',
        sessionTtlSeconds: 3600,
        handoffTicketTtlSeconds: 600,
        reconnectChallengeTtlSeconds: 60,
        stunUrls: [],
        createToken: null,
        upgradeWebSocket,
        now,
        manifestCookieSigner,
        manifestCookieTtlSeconds: 1800,
        webApp: { assetsRoot },
    })
    return { app, store, manifestCookieSigner }
}

async function seedPendingPairing(store: MemoryPairingStore, pairingId: string): Promise<void> {
    await store.createSession({
        id: pairingId,
        state: 'waiting',
        approvalStatus: null,
        shortCode: '123456',
        host: {
            tokenHash: 'host-hash',
            label: 'host',
            metadata: { source: 'desktop' },
        },
        authorizedDevice: null,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        expiresAt: FIXED_NOW + 3600 * 1000,
    })
}

async function seedApprovedPairing(store: MemoryPairingStore, pairingId: string): Promise<void> {
    await seedPendingPairing(store, pairingId)
    const guest = {
        tokenHash: 'guest-hash',
        label: 'guest',
        metadata: { platform: 'ios' },
        publicKey: 'guest-public-key',
        connectedAt: FIXED_NOW,
        lastSeenAt: FIXED_NOW,
    }
    await store.verifyCodeAndApprove(
        pairingId,
        '123456',
        {
            id: guest.publicKey,
            publicKey: guest.publicKey,
            label: guest.label,
            metadata: guest.metadata,
            authorizedAt: FIXED_NOW,
            lastSeenAt: FIXED_NOW,
        },
        { connectionId: guest.tokenHash, participant: guest },
        FIXED_NOW
    )
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true })
    }
})

describe('GET /manifest.webmanifest', () => {
    let app: ReturnType<typeof buildTestApp>['app']
    let store: MemoryPairingStore
    let manifestCookieSigner: ReturnType<typeof createPairingManifestCookieSigner>

    beforeEach(() => {
        ;({ app, store, manifestCookieSigner } = buildTestApp())
    })

    it('returns the fallback workspace shell start_url when no signed cookie is present so unbound visitors never receive a handoff', async () => {
        const response = await app.request('/manifest.webmanifest')
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as Record<string, unknown>
        expect(manifest.start_url).toBe('/sessions?remote=1')
        expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    })

    it('issues a one-shot handoff fragment when a valid cookie binds an approved pairing so iOS Safari add-to-home-screen lands inside the workspace', async () => {
        await seedApprovedPairing(store, 'pairing-1')
        const cookie = manifestCookieSigner.sign('pairing-1', FIXED_NOW + 1800 * 1000)

        const response = await app.request('/manifest.webmanifest', {
            headers: { cookie: `viby_pair_manifest=${cookie}` },
        })
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as Record<string, unknown>
        const startUrl = String(manifest.start_url)
        // The handoff travels in the query (not the fragment) because iOS
        // WebKit standalone PWAs strip the fragment from the launch URL.
        expect(startUrl).toStartWith('/p/pairing-1?handoff=')
        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    it('falls back without clearing a newer manifest cookie that may be racing in', async () => {
        await seedApprovedPairing(store, 'pairing-1')
        await store.deleteSession('pairing-1', FIXED_NOW)
        const cookie = manifestCookieSigner.sign('pairing-1', FIXED_NOW + 1800 * 1000)

        const response = await app.request('/manifest.webmanifest', {
            headers: { cookie: `viby_pair_manifest=${cookie}` },
        })
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as Record<string, unknown>
        expect(manifest.start_url).toBe('/sessions?remote=1')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('set-cookie')).toBeNull()
    })

    it('ignores an invalid cookie without clearing a newer manifest cookie that may be racing in', async () => {
        const response = await app.request('/manifest.webmanifest', {
            headers: { cookie: 'viby_pair_manifest=pairing-1.1.notavalidmac' },
        })
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as Record<string, unknown>
        expect(manifest.start_url).toBe('/sessions?remote=1')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('set-cookie')).toBeNull()
    })

    it('sets a manifest cookie on verify so iOS add-to-home bare manifest fetches still receive a handoff', async () => {
        await seedPendingPairing(store, 'pairing-verify')
        const verifyResponse = await app.request('/pairings/pairing-verify/verify-code', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: '123456', label: 'Phone Browser', publicKey: 'browser-public-key' }),
        })
        expect(verifyResponse.status).toBe(200)
        const cookie = verifyResponse.headers.get('set-cookie')?.split(';')[0]
        expect(cookie).toStartWith('viby_pair_manifest=')

        const manifestResponse = await app.request('/manifest.webmanifest', { headers: { cookie: cookie ?? '' } })
        expect(manifestResponse.status).toBe(200)
        const manifest = (await manifestResponse.json()) as Record<string, unknown>
        expect(String(manifest.start_url)).toStartWith('/p/pairing-verify?handoff=')
        expect(manifestResponse.headers.get('cache-control')).toBe('no-store')
    })

    it('honours the path-based pairing query so iOS Chrome standalone PWAs whose manifest fetch strips cookies still receive a personalized handoff', async () => {
        await seedApprovedPairing(store, 'pairing-1')

        const response = await app.request('/manifest.webmanifest?pairing=pairing-1')
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as Record<string, unknown>
        expect(String(manifest.start_url)).toStartWith('/p/pairing-1?handoff=')
        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    it('rejects pairing query values containing path-unsafe characters so an attacker cannot inject URL fragments through the manifest endpoint', async () => {
        const response = await app.request('/manifest.webmanifest?pairing=pairing%2Fwith%2Fslash')
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as Record<string, unknown>
        expect(manifest.start_url).toBe('/sessions?remote=1')
        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    it('uses the stable invite URL before approval so iOS cannot install the generic workspace fallback', async () => {
        await store.createSession({
            id: 'pairing-pending',
            state: 'waiting',
            approvalStatus: null,
            shortCode: '654321',
            host: { tokenHash: 'host-hash', label: 'host', metadata: { source: 'desktop' } },
            authorizedDevice: null,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
            expiresAt: FIXED_NOW + 3600 * 1000,
        })

        const response = await app.request('/manifest.webmanifest?pairing=pairing-pending')
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as Record<string, unknown>
        expect(manifest.start_url).toBe('/p/pairing-pending')
        expect(response.headers.get('cache-control')).toBe('no-store')
    })
})
