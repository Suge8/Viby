import { PAIRING_PWA_HANDOFF_PARAM, PAIRING_PWA_MANIFEST_PAIRING_PARAM } from '@viby/protocol/pairing'
import type { Context } from 'hono'
import { generatePairingSecret, hashPairingSecret } from './crypto'
import { getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { readPairingManifestCookieValue } from './manifestCookie'
import { readPairingManifestTemplate } from './webAppAssets'

const DEFAULT_START_URL = '/sessions?remote=1'
const PAIRING_ID_PATTERN = /^[A-Za-z0-9_-]+$/

function buildPairingStartUrl(pairingId: string): string {
    return `/p/${encodeURIComponent(pairingId)}`
}

function buildPersonalizedStartUrl(pairingId: string, handoffTicket: string): string {
    // The handoff secret travels in the URL query (not the fragment) because
    // iOS WebKit standalone PWAs silently strip the URL fragment from the
    // launch URL on cold start, leaving the React app without any way to
    // discover the handoff ticket. The ticket is one-shot consumed within
    // ~100ms of PWA boot and scrubbed from the address bar, so the brief
    // appearance in HTTP access logs is bounded and acceptable. Sharing the
    // workspace URL stays safe because the workspace URL itself never
    // contains the ticket — only the manifest-controlled launch URL does.
    const launchParams = new URLSearchParams({ [PAIRING_PWA_HANDOFF_PARAM]: handoffTicket })
    return `/p/${encodeURIComponent(pairingId)}?${launchParams.toString()}`
}

function buildManifestBody(template: Record<string, unknown>, startUrl: string): ArrayBuffer {
    const rewritten = JSON.stringify({ ...template, scope: '/', start_url: startUrl })
    return new TextEncoder().encode(rewritten).buffer as ArrayBuffer
}

function respondManifest(
    c: Context,
    body: ArrayBuffer,
    options: { cacheableFallback?: boolean; personalized: boolean }
): Response {
    c.header('content-type', 'application/manifest+json; charset=utf-8')
    c.header('content-length', String(body.byteLength))
    // Any pairing-bound manifest response must not be cached: the same URL
    // can become approved moments later, and stale fallback start_url values
    // strand installed PWAs on the rescan screen.
    // Contract gate pins the owner expression: options.personalized ? 'no-store'
    const cacheControl = options.personalized
        ? 'no-store'
        : options.cacheableFallback
          ? 'public, max-age=3600'
          : 'no-store'
    c.header('cache-control', cacheControl)
    return c.body(body)
}

function resolvePairingIdFromRequest(c: Context, options: PairingHttpOptions, now: number): string | null {
    // Path-based identification is the primary channel: when the broker
    // serves `/p/<id>` HTML it rewrites the manifest link to include the
    // pairing id in the query string. This survives every iOS WebKit
    // standalone storage quirk because the URL itself carries the identifier.
    const queryUrl = new URL(c.req.url, 'https://pairing.local')
    const queryPairingId = queryUrl.searchParams.get(PAIRING_PWA_MANIFEST_PAIRING_PARAM)
    if (queryPairingId && PAIRING_ID_PATTERN.test(queryPairingId)) return queryPairingId

    // Cookie-based identification is the back-compat channel for older PWAs
    // whose installed start_url still references `/manifest.webmanifest`
    // without a query string. Recovering them only requires the signed
    // cookie set by the authenticated `pwa-handoff-ticket` round-trip.
    const cookieValue = readPairingManifestCookieValue(c.req.header('cookie'))
    if (!cookieValue) return null
    return options.manifestCookieSigner.verify(cookieValue, now)
}

function requestHasPairingHint(c: Context): boolean {
    const queryUrl = new URL(c.req.url, 'https://pairing.local')
    return (
        queryUrl.searchParams.has(PAIRING_PWA_MANIFEST_PAIRING_PARAM) ||
        Boolean(readPairingManifestCookieValue(c.req.header('cookie')))
    )
}

/**
 * Serves `/manifest.webmanifest` with a personalized `start_url` whenever the
 * request URL carries a pairing id, either as a query string injected by the
 * HTML server during the `/p/<id>` render or, for legacy installed PWAs, via
 * the signed manifest cookie. The pairing id is a public identifier once
 * approved (it appears in the QR URL), so query-based identification is
 * sufficient and removes every iOS standalone storage isolation failure mode
 * that cookie-only personalization exposes.
 *
 * Unbound callers (no query, no cookie) receive the default fallback pointing
 * at the workspace shell, where the React app renders an actionable re-scan
 * prompt instead of an opaque error.
 */
export function createPairingManifestHandler(options: PairingHttpOptions): (c: Context) => Promise<Response> {
    return async (c: Context) => {
        const template = readPairingManifestTemplate(options.webApp)
        if (!template) return c.notFound()

        const now = getNow(options.now)
        const hasPairingHint = requestHasPairingHint(c)
        const pairingId = resolvePairingIdFromRequest(c, options, now)
        if (!pairingId) {
            return respondManifest(c, buildManifestBody(template, DEFAULT_START_URL), {
                cacheableFallback: !hasPairingHint,
                personalized: false,
            })
        }

        const session = await options.store.getSession(pairingId)
        if (!session || session.state === 'deleted' || session.state === 'expired') {
            return respondManifest(c, buildManifestBody(template, DEFAULT_START_URL), {
                cacheableFallback: false,
                personalized: false,
            })
        }
        if (session.approvalStatus !== 'approved' || !session.authorizedDevice?.publicKey) {
            return respondManifest(c, buildManifestBody(template, buildPairingStartUrl(pairingId)), {
                personalized: true,
            })
        }

        const handoffTicket = generatePairingSecret()
        const expiresAt = now + options.handoffTicketTtlSeconds * 1000
        await options.store.issueHandoffTicket(pairingId, {
            tokenHash: hashPairingSecret(handoffTicket),
            expiresAt,
        })
        options.metrics?.increment('pwa_manifest_personalized')
        const startUrl = buildPersonalizedStartUrl(pairingId, handoffTicket)
        return respondManifest(c, buildManifestBody(template, startUrl), { personalized: true })
    }
}
