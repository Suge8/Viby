import {
    hasPairingWorkspaceIntent,
    PAIRING_NAKED_WORKSPACE_REDIRECT_URL,
    PairingClaimRequestSchema,
    PairingCreateRequestSchema,
    PairingVerifyCodeRequestSchema,
} from '@viby/protocol/pairing'
import { type Context, Hono } from 'hono'
import { readBrandLogoAsset } from './brandLogoAsset'
import { registerPairingReconnectRoutes } from './httpReconnectRoutes'
import { registerPairingSessionRoutes } from './httpSessionRoutes'
import { authorizeCreateRequest, getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { createJsonBodyValidator } from './httpValidation'
import { readWebAppAsset, readWebAppIndexHtml } from './webAppAssets'

export type { PairingHttpOptions } from './httpTypes'

function getRequestSearch(url: string): string {
    return new URL(url, 'https://pairing.local').search
}

function serveWorkspaceApp(path: string, search: string): boolean {
    return hasPairingWorkspaceIntent(path, search)
}

function redirectNakedWorkspace(c: Context): Response {
    c.header('cache-control', 'no-store')
    return c.redirect(PAIRING_NAKED_WORKSPACE_REDIRECT_URL, 302)
}

function serveWebAppHtml(c: Context, options: PairingHttpOptions): Response | Promise<Response> {
    const html = readWebAppIndexHtml(options.webApp)
    return c.html(html, 200, { 'content-length': String(Buffer.byteLength(html)) })
}

function serveWebAppAsset(c: Context, options: PairingHttpOptions): Response | Promise<Response> {
    const asset = readWebAppAsset(c.req.path, options.webApp)
    if (!asset) {
        return c.notFound()
    }
    return c.body(asset.body, 200, {
        'cache-control': asset.cacheControl,
        'content-length': String(asset.body.byteLength),
        'content-type': asset.contentType,
    })
}

export function createPairingApp(options: PairingHttpOptions): Hono {
    const app = new Hono()

    app.get('/health', (c) => c.json({ ok: true, service: 'pairing' }))
    app.get('/ready', async (c) => {
        try {
            await options.store.healthCheck()
            return c.json({ ok: true, service: 'pairing', store: 'ready' })
        } catch {
            return c.json({ ok: false, service: 'pairing', store: 'unavailable' }, 503)
        }
    })
    app.get('/', (c) => c.json({ ok: true, service: 'viby-pairing', pairingBaseUrl: options.publicUrl }))
    app.get('/brand-logo-tight.png', (c) =>
        c.body(readBrandLogoAsset(), 200, {
            'cache-control': 'public, max-age=31536000, immutable',
            'content-type': 'image/png',
        })
    )
    app.get('/p/:id', (c) => serveWebAppHtml(c, options))
    app.get('/sessions', (c) =>
        serveWorkspaceApp(c.req.path, getRequestSearch(c.req.url))
            ? serveWebAppHtml(c, options)
            : redirectNakedWorkspace(c)
    )
    app.get('/sessions/*', (c) =>
        serveWorkspaceApp(c.req.path, getRequestSearch(c.req.url))
            ? serveWebAppHtml(c, options)
            : redirectNakedWorkspace(c)
    )
    app.get('/assets/*', (c) => serveWebAppAsset(c, options))
    app.get('/metrics', (c) => {
        const authError = authorizeCreateRequest(options, c.req.header('authorization'))
        if (authError) {
            return authError
        }
        const now = getNow(options.now)
        return c.json({
            ...(options.metrics?.snapshot(now) ?? { counters: {}, now }),
            websocket: options.socketHub.snapshot(),
        })
    })

    registerPairingSessionRoutes(app, options, {
        createPairingBodyValidator: createJsonBodyValidator(PairingCreateRequestSchema, 'Invalid pairing create body'),
        claimPairingBodyValidator: createJsonBodyValidator(PairingClaimRequestSchema, 'Invalid pairing claim body'),
        verifyCodeBodyValidator: createJsonBodyValidator(
            PairingVerifyCodeRequestSchema,
            'Invalid pairing verification body'
        ),
    })
    registerPairingReconnectRoutes(app, options)
    app.get('/:asset', (c) => {
        if (serveWorkspaceApp(c.req.path, getRequestSearch(c.req.url))) {
            return serveWebAppHtml(c, options)
        }
        return serveWebAppAsset(c, options)
    })

    return app
}
