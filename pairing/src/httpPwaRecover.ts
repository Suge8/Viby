import type { Context } from 'hono'
import { z } from 'zod'
import { generatePairingSecret, hashPairingSecret } from './crypto'
import { getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { buildPairingManifestCookieClearHeader, readPairingManifestCookieValue } from './manifestCookie'

export const PairingCookieRecoverResponseSchema = z.object({
    pairingId: z.string().min(1),
    handoffTicket: z.string().min(1),
    expiresAt: z.number().int().positive(),
})
export type PairingCookieRecoverResponse = z.infer<typeof PairingCookieRecoverResponseSchema>

const PAIRING_COOKIE_RECOVER_ERRORS = {
    no_cookie: { status: 401, code: 'pairing_cookie_missing' },
    invalid_cookie: { status: 401, code: 'pairing_cookie_invalid' },
    pairing_unavailable: { status: 410, code: 'pairing_unavailable' },
} as const

type PairingCookieRecoverFailure = keyof typeof PAIRING_COOKIE_RECOVER_ERRORS

function respondFailure(c: Context, failure: PairingCookieRecoverFailure, options: { clearCookie: boolean }): Response {
    if (options.clearCookie) {
        c.header('set-cookie', buildPairingManifestCookieClearHeader(), { append: true })
    }
    c.header('cache-control', 'no-store')
    const detail = PAIRING_COOKIE_RECOVER_ERRORS[failure]
    return c.json({ ok: false, code: detail.code }, detail.status)
}

/**
 * PWA cold-start recovery: when a PWA launches into the workspace shell
 * fallback (`/sessions?remote=1`), the React app calls this endpoint to ask
 * the broker to identify the workspace using the signed manifest cookie. If
 * the cookie is valid for an approved pairing, the broker issues a one-shot
 * handoff ticket inline and the PWA navigates to `/p/<id>#handoff=<ticket>`
 * to complete the standard claim flow, all without user input.
 *
 * iOS Chrome and Safari each have their own opinions about whether a PWA
 * standalone window shares cookies with the parent browser. This handler is
 * agnostic to that: if the cookie reached the broker it is treated as proof,
 * and if it did not the response gives the React app a clean code (`pairing_cookie_missing`)
 * so the UI can render an actionable "open browser and re-scan" prompt.
 */
export function createPairingCookieRecoverHandler(options: PairingHttpOptions): (c: Context) => Promise<Response> {
    return async (c: Context) => {
        const cookieValue = readPairingManifestCookieValue(c.req.header('cookie'))
        if (!cookieValue) return respondFailure(c, 'no_cookie', { clearCookie: false })

        const now = getNow(options.now)
        const pairingId = options.manifestCookieSigner.verify(cookieValue, now)
        if (!pairingId) return respondFailure(c, 'invalid_cookie', { clearCookie: true })

        const session = await options.store.getSession(pairingId)
        const unusable =
            !session ||
            session.state === 'deleted' ||
            session.state === 'expired' ||
            session.approvalStatus !== 'approved' ||
            !session.guest?.publicKey
        if (unusable) return respondFailure(c, 'pairing_unavailable', { clearCookie: true })

        const handoffTicket = generatePairingSecret()
        const expiresAt = now + options.handoffTicketTtlSeconds * 1000
        await options.store.issueHandoffTicket(pairingId, {
            tokenHash: hashPairingSecret(handoffTicket),
            expiresAt,
        })
        options.metrics?.increment('pwa_cookie_recover_success')
        c.header('cache-control', 'no-store')
        return c.json(PairingCookieRecoverResponseSchema.parse({ pairingId, handoffTicket, expiresAt }))
    }
}
