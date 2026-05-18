import {
    PairingClaimResponseSchema,
    type PairingPwaHandoffClaimRequest,
    type PairingPwaHandoffTicketRequest,
    PairingPwaHandoffTicketResponseSchema,
    toPairingSessionSnapshotForRole,
} from '@viby/protocol/pairing'
import type { Hono } from 'hono'
import { generatePairingSecret, hashPairingSecret } from './crypto'
import { verifyStoredPairingDeviceProof } from './httpDeviceProofSupport'
import { enforcePairingRateLimit, getClientAddress, logPairingAudit, rejectPairingCode } from './httpRouteSupport'
import { buildPairingUrls, createIceServers, createParticipantRecord, getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import type { createJsonBodyValidator } from './httpValidation'
import { buildPairingManifestCookieHeader } from './manifestCookie'

type PairingPwaHandoffRouteValidators = {
    handoffClaimBodyValidator: ReturnType<typeof createJsonBodyValidator<PairingPwaHandoffClaimRequest>>
    handoffTicketBodyValidator: ReturnType<typeof createJsonBodyValidator<PairingPwaHandoffTicketRequest>>
}

export function registerPairingPwaHandoffRoutes(
    app: Hono,
    options: PairingHttpOptions,
    validators: PairingPwaHandoffRouteValidators
): void {
    app.post('/pairings/:id/pwa-handoff-ticket', validators.handoffTicketBodyValidator, async (c) => {
        const rateLimitResponse = enforcePairingRateLimit(c, options, 'reconnect')
        if (rateLimitResponse) return rateLimitResponse

        const pairingId = c.req.param('id')
        const body = c.req.valid('json')
        const now = getNow(options.now)
        options.metrics?.increment('reconnect_requests')

        const identity = await options.store.getSessionByTokenHash(hashPairingSecret(body.token))
        if (!identity || identity.session.id !== pairingId || identity.role !== 'guest') {
            return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_token')
        }
        if (identity.session.state === 'deleted' || identity.session.state === 'expired') {
            return rejectPairingCode(c, options, 'reconnect_rejected', 410, 'pairing_unavailable')
        }
        const guest = identity.session.guest
        if (identity.session.approvalStatus !== 'approved' || !guest) {
            return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
        }

        const expectedPublicKey = guest.publicKey ?? body.deviceProof.publicKey
        const proofFailure = await verifyStoredPairingDeviceProof({
            pairingId,
            role: 'guest',
            proof: body.deviceProof,
            expectedPublicKey,
            now,
            store: options.store,
        })
        if (proofFailure === 'invalid') {
            return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
        }
        if (proofFailure === 'challenge-expired') {
            return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_reconnect_challenge_expired')
        }
        if (!guest.publicKey) {
            const bound = await options.store.bindGuestDeviceKey(pairingId, body.deviceProof.publicKey, now)
            if (!bound) {
                return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
            }
        }

        const handoffTicket = generatePairingSecret()
        const expiresAt = now + options.ticketTtlSeconds * 1000
        await options.store.issueHandoffTicket(pairingId, {
            tokenHash: hashPairingSecret(handoffTicket),
            expiresAt,
        })
        // iOS Safari ignores manifest link href mutations and may bypass the
        // Service Worker when fetching the manifest during "Add to Home
        // Screen". The only reliable channel to deliver a personalized
        // start_url to that fetch is an HttpOnly cookie set during this
        // authenticated round-trip; the manifest endpoint reads it later to
        // issue a fresh handoff ticket without any client-side coordination.
        const cookieExpiresAtMs = now + options.manifestCookieTtlSeconds * 1000
        const cookieValue = options.manifestCookieSigner.sign(pairingId, cookieExpiresAtMs)
        c.header('set-cookie', buildPairingManifestCookieHeader(cookieValue, options.manifestCookieTtlSeconds), {
            append: true,
        })
        logPairingAudit(options, 'pwa_handoff_ticket', { ip: getClientAddress(c), pairingId })
        return c.json(PairingPwaHandoffTicketResponseSchema.parse({ handoffTicket, expiresAt }))
    })

    app.post('/pairings/:id/pwa-handoff-claim', validators.handoffClaimBodyValidator, async (c) => {
        const rateLimitResponse = enforcePairingRateLimit(c, options, 'claim')
        if (rateLimitResponse) return rateLimitResponse

        const pairingId = c.req.param('id')
        const body = c.req.valid('json')
        const now = getNow(options.now)
        options.metrics?.increment('claim_requests')

        const session = await options.store.getSession(pairingId)
        if (!session || session.state === 'deleted' || session.state === 'expired') {
            return rejectPairingCode(c, options, 'claim_rejected', 410, 'pairing_unavailable')
        }
        if (session.approvalStatus !== 'approved' || !session.guest) {
            return rejectPairingCode(c, options, 'claim_rejected', 403, 'pairing_invalid_handoff_ticket')
        }

        const accepted = await options.store.consumeHandoffTicket(pairingId, hashPairingSecret(body.handoffTicket), now)
        if (!accepted) {
            return rejectPairingCode(c, options, 'claim_rejected', 403, 'pairing_invalid_handoff_ticket')
        }

        const guestToken = generatePairingSecret()
        const renewed = await options.store.renewSession(pairingId, now + options.sessionTtlSeconds * 1000, now)
        const guest = renewed?.guest
        if (!guest) {
            return rejectPairingCode(c, options, 'claim_rejected', 410, 'pairing_unavailable')
        }

        const recovered = await options.store.rotateGuestToken(
            pairingId,
            createParticipantRecord({
                token: guestToken,
                label: body.label ?? guest.label,
                publicKey: body.publicKey,
                metadata: guest.metadata,
            }),
            now
        )
        if (!recovered) {
            return rejectPairingCode(c, options, 'claim_rejected', 410, 'pairing_unavailable')
        }

        logPairingAudit(options, 'pwa_handoff_claim', { ip: getClientAddress(c), pairingId })
        const urls = buildPairingUrls(options.publicUrl, pairingId, '', guestToken)
        return c.json(
            PairingClaimResponseSchema.parse({
                pairing: toPairingSessionSnapshotForRole(recovered, 'guest'),
                guestToken,
                wsUrl: urls.wsUrl,
                tunnelUrl: urls.tunnelUrl,
                iceServers: createIceServers(options, pairingId, now),
            })
        )
    })
}
