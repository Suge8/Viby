import { PROTOCOL_VERSION } from '@viby/protocol'
import {
    hasPairingWorkspaceIntent,
    PAIRING_NAKED_WORKSPACE_REDIRECT_URL,
    PAIRING_PWA_HANDOFF_PARAM,
    PAIRING_PWA_MANIFEST_PAIRING_PARAM,
    PairingCreateRequestSchema,
    PairingPwaHandoffClaimRequestSchema,
    PairingPwaHandoffTicketRequestSchema,
    PairingVerifyCodeRequestSchema,
} from '@viby/protocol/pairing'
import { type Context, Hono } from 'hono'
import { readBrandLogoAsset } from './brandLogoAsset'
import { registerPairingPwaHandoffRoutes } from './httpPwaHandoffRoutes'
import { createPairingManifestHandler } from './httpPwaManifest'
import { createPairingCookieRecoverHandler } from './httpPwaRecover'
import { registerPairingReconnectRoutes } from './httpReconnectRoutes'
import { registerPairingSessionRoutes } from './httpSessionRoutes'
import { registerPairingSocketRoutes } from './httpSocketRoutes'
import { authorizeCreateRequest, getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { createJsonBodyValidator } from './httpValidation'
import { readWebAppAsset, readWebAppIndexHtml } from './webAppAssets'

export type { PairingHttpOptions } from './httpTypes'

const WEB_APP_HTML_CACHE_CONTROL = 'no-store'
const SENSITIVE_LOG_SEARCH_PARAMS = new Set(['handoff', 'token'])

function getRequestSearch(url: string): string {
    return new URL(url, 'https://pairing.local').search
}

function getSafeRequestSearch(url: string): string {
    const parsed = new URL(url, 'https://pairing.local')
    for (const key of Array.from(parsed.searchParams.keys())) {
        if (SENSITIVE_LOG_SEARCH_PARAMS.has(key.toLowerCase())) parsed.searchParams.set(key, '<redacted>')
    }
    return parsed.search
}

function serveWorkspaceApp(path: string, search: string): boolean {
    return hasPairingWorkspaceIntent(path, search)
}

function serveWebAppAssetByPath(c: Context, options: PairingHttpOptions): Response | Promise<Response> {
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

function redirectNakedWorkspace(c: Context): Response {
    c.header('cache-control', 'no-store')
    return c.redirect(PAIRING_NAKED_WORKSPACE_REDIRECT_URL, 302)
}

// iOS Chrome / iOS Safari standalone PWAs do not forward cookies to the
// system-level manifest fetch issued at "Add to Home Screen" time, so a
// cookie-only manifest personalization path leaves those users stuck on the
// fallback workspace URL. Injecting the pairing id directly into the manifest
// link href guarantees a personalized `start_url` regardless of cookie
// behavior. The pairing id is public once approved (it appears in the QR
// URL), so the only added attack surface is that someone holding the same
// pairing id during the post-approval window can also install a PWA bound
// to that pairing; the desktop device list surfaces every binding so the
// owner can revoke unexpected installs.
function injectPairingManifestLink(html: string, pairingId: string): string {
    const params = new URLSearchParams({ [PAIRING_PWA_MANIFEST_PAIRING_PARAM]: pairingId })
    return html.replace(/<link rel="manifest"([^>]*?) href="([^"]+)"/, (match, attrs, href) => {
        const url = href.includes('?') ? `${href}&${params.toString()}` : `${href}?${params.toString()}`
        return `<link rel="manifest"${attrs} href="${url}"`
    })
}

function stripManifestLink(html: string): string {
    return html.replace(/\s*<link rel="manifest"[^>]*>/, '')
}

function isPwaHandoffLaunch(url: string): boolean {
    return new URL(url, 'https://pairing.local').searchParams.has(PAIRING_PWA_HANDOFF_PARAM)
}

function serveWebAppHtml(
    c: Context,
    options: PairingHttpOptions,
    page: { pairingId?: string; suppressManifest?: boolean } = {}
): Response | Promise<Response> {
    const baseHtml = readWebAppIndexHtml(options.webApp)
    const html = page.suppressManifest
        ? stripManifestLink(baseHtml)
        : page.pairingId
          ? injectPairingManifestLink(baseHtml, page.pairingId)
          : baseHtml
    return c.html(html, 200, {
        'cache-control': WEB_APP_HTML_CACHE_CONTROL,
        'content-length': String(Buffer.byteLength(html)),
        expires: '0',
        pragma: 'no-cache',
    })
}

export function createPairingApp(options: PairingHttpOptions): Hono {
    const app = new Hono()

    // Lightweight request log for diagnosing PWA install flows in production.
    // Skips the high-volume health probes and only emits one structured line
    // per request, so deployment journals stay readable while still showing
    // exactly which manifest / handoff fetches each device made.
    app.use('*', async (c, next) => {
        const startedAt = Date.now()
        await next()
        if (c.req.path === '/health' || c.req.path === '/ready') return
        const logger = options.logger ?? console
        logger.info?.(
            `[Pairing] req ${c.req.method} ${c.req.path}${getSafeRequestSearch(c.req.url)} -> ${c.res.status} (${Date.now() - startedAt}ms) cookie=${c.req.header('cookie') ? 'yes' : 'no'} ua=${c.req.header('user-agent')?.slice(0, 80) ?? ''}`
        )
    })

    app.get('/health', (c) => c.json({ ok: true, service: 'pairing', protocolVersion: PROTOCOL_VERSION }))
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
    app.get('/p/:id', (c) =>
        serveWebAppHtml(c, options, {
            pairingId: c.req.param('id'),
            suppressManifest: isPwaHandoffLaunch(c.req.url),
        })
    )
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
    app.get('/assets/*', (c) => serveWebAppAssetByPath(c, options))
    // Manifest is dynamic per pairing cookie, so it bypasses the static
    // asset reader and runs the cookie-aware handler instead.
    app.get('/manifest.webmanifest', createPairingManifestHandler(options))
    // PWA standalone cold-start fallback: the workspace shell calls this to
    // recover the pairing via the same signed cookie. iOS Chrome / Safari may
    // strip cookies on the manifest fetch but keep them on regular fetches
    // from the PWA window, so this is the second-chance bootstrap path.
    app.get('/pairings/cookie-recover', createPairingCookieRecoverHandler(options))
    app.get('/metrics', (c) => {
        const authError = authorizeCreateRequest(options, c.req.header('authorization'))
        if (authError) {
            return authError
        }
        const now = getNow(options.now)
        return c.json({
            ...(options.metrics?.snapshot(now) ?? { counters: {}, now }),
            websocket: options.socketHub.snapshot(),
            tunnelWebsocket: options.tunnelHub.snapshot(),
        })
    })

    registerPairingSessionRoutes(app, options, {
        createPairingBodyValidator: createJsonBodyValidator(PairingCreateRequestSchema, 'Invalid pairing create body'),
        verifyCodeBodyValidator: createJsonBodyValidator(
            PairingVerifyCodeRequestSchema,
            'Invalid pairing verification body'
        ),
    })
    registerPairingSocketRoutes(app, options)
    registerPairingReconnectRoutes(app, options)
    registerPairingPwaHandoffRoutes(app, options, {
        handoffClaimBodyValidator: createJsonBodyValidator(
            PairingPwaHandoffClaimRequestSchema,
            'Invalid pairing PWA handoff claim body'
        ),
        handoffTicketBodyValidator: createJsonBodyValidator(
            PairingPwaHandoffTicketRequestSchema,
            'Invalid pairing PWA handoff ticket body'
        ),
    })
    app.get('/:asset', (c) => {
        if (serveWorkspaceApp(c.req.path, getRequestSearch(c.req.url))) {
            return serveWebAppHtml(c, options)
        }
        return serveWebAppAssetByPath(c, options)
    })

    return app
}
