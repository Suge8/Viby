import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * iOS Safari ignores `<link rel="manifest">` href mutations after page load
 * and may bypass Service Worker interception when reading the manifest at
 * "Add to Home Screen" time. The only reliable way to deliver a personalized
 * `start_url` with a fresh handoff ticket to iOS is for the server to render
 * the personalized manifest itself, identifying the requester via an
 * HttpOnly cookie set during the authenticated `pwa-manifest-cookie` exchange.
 *
 * Cookie value format: `<pairingId>.<expiresAt>.<hmac>` where hmac is
 * HMAC-SHA256(`<pairingId>.<expiresAt>`, secret) base64url-encoded. The
 * production secret comes from config so installed PWA entries survive broker
 * restarts. Tests and local dev may omit it and use an in-process secret.
 */
export const PAIRING_MANIFEST_COOKIE_NAME = 'viby_pair_manifest'
const PAIRING_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export type PairingManifestCookieSignerOptions = {
    secret?: Uint8Array
}

export interface PairingManifestCookieSigner {
    sign(pairingId: string, expiresAtMs: number): string
    verify(value: string, nowMs: number): string | null
}

export function createPairingManifestCookieSigner(
    options: PairingManifestCookieSignerOptions = {}
): PairingManifestCookieSigner {
    const secret = options.secret ?? randomBytes(32)
    return {
        sign(pairingId: string, expiresAtMs: number): string {
            const payload = `${pairingId}.${expiresAtMs}`
            const mac = createHmac('sha256', secret).update(payload).digest('base64url')
            return `${payload}.${mac}`
        },
        verify(value: string, nowMs: number): string | null {
            const parts = value.split('.')
            if (parts.length !== 3) return null
            const [pairingId, expiresAtRaw, providedMac] = parts as [string, string, string]
            if (!PAIRING_ID_PATTERN.test(pairingId)) return null
            const expiresAtMs = Number.parseInt(expiresAtRaw, 10)
            if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null
            const expectedMac = createHmac('sha256', secret).update(`${pairingId}.${expiresAtRaw}`).digest('base64url')
            try {
                if (
                    providedMac.length !== expectedMac.length ||
                    !timingSafeEqual(Buffer.from(providedMac), Buffer.from(expectedMac))
                ) {
                    return null
                }
            } catch {
                return null
            }
            return pairingId
        },
    }
}

export function readPairingManifestCookieValue(cookieHeader: string | null | undefined): string | null {
    if (!cookieHeader) return null
    for (const segment of cookieHeader.split(';')) {
        const [rawName, ...rest] = segment.split('=')
        if (rawName?.trim() === PAIRING_MANIFEST_COOKIE_NAME) {
            return rest.join('=').trim() || null
        }
    }
    return null
}

export function buildPairingManifestCookieHeader(value: string, maxAgeSeconds: number): string {
    return `${PAIRING_MANIFEST_COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
}

export function buildPairingManifestCookieHeaderForPairing(options: {
    maxAgeSeconds: number
    nowMs: number
    pairingId: string
    signer: PairingManifestCookieSigner
}): string {
    const expiresAtMs = options.nowMs + options.maxAgeSeconds * 1000
    return buildPairingManifestCookieHeader(options.signer.sign(options.pairingId, expiresAtMs), options.maxAgeSeconds)
}

export function buildPairingManifestCookieClearHeader(): string {
    return `${PAIRING_MANIFEST_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}
