const COOKIE_RECOVER_TIMEOUT_MS = 8_000

export type PairingCookieRecoverResponse = {
    pairingId: string
    handoffTicket: string
    expiresAt: number
}

function parseRecoverPayload(payload: unknown): PairingCookieRecoverResponse | null {
    if (!payload || typeof payload !== 'object') return null
    const record = payload as Record<string, unknown>
    if (typeof record.pairingId !== 'string' || record.pairingId.length === 0) return null
    if (typeof record.handoffTicket !== 'string' || record.handoffTicket.length === 0) return null
    if (typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt) || record.expiresAt <= 0) return null
    return {
        pairingId: record.pairingId,
        handoffTicket: record.handoffTicket,
        expiresAt: record.expiresAt,
    }
}

export type PairingCookieRecoverFailure =
    | { kind: 'missing' }
    | { kind: 'invalid' }
    | { kind: 'unavailable' }
    | { kind: 'transient' }

export type PairingCookieRecoverResult =
    | { ok: true; value: PairingCookieRecoverResponse }
    | { ok: false; failure: PairingCookieRecoverFailure }

function readErrorCode(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const code = (payload as { code?: unknown }).code
    return typeof code === 'string' ? code : null
}

function resolveFailureFromCode(status: number, code: string | null): PairingCookieRecoverFailure {
    if (code === 'pairing_cookie_missing') return { kind: 'missing' }
    if (code === 'pairing_cookie_invalid') return { kind: 'invalid' }
    if (code === 'pairing_unavailable') return { kind: 'unavailable' }
    return status >= 500 ? { kind: 'transient' } : { kind: 'invalid' }
}

/**
 * Asks the broker to recover the pairing identity from the signed manifest
 * cookie. This is the second-chance bootstrap when a PWA cold-starts into
 * the workspace shell fallback URL without any storage state. The fetch is
 * intentionally `credentials: 'include'` even though the call is same-origin,
 * because some iOS PWA standalone implementations require the explicit
 * credentials flag before forwarding cookies to subresource fetches.
 */
export async function recoverRemotePairingFromCookie(): Promise<PairingCookieRecoverResult> {
    try {
        const response = await fetch('/pairings/cookie-recover', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal: AbortSignal.timeout(COOKIE_RECOVER_TIMEOUT_MS),
        })
        let payload: unknown = null
        try {
            payload = await response.json()
        } catch {
            // Body may be empty on certain proxy edge errors; fall through.
        }
        if (response.ok) {
            const parsed = parseRecoverPayload(payload)
            if (parsed) return { ok: true, value: parsed }
            return { ok: false, failure: { kind: 'transient' } }
        }
        return { ok: false, failure: resolveFailureFromCode(response.status, readErrorCode(payload)) }
    } catch {
        return { ok: false, failure: { kind: 'transient' } }
    }
}
