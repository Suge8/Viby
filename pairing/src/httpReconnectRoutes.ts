import {
    PairingReconnectChallengeRequestSchema,
    PairingReconnectChallengeResponseSchema,
    type PairingReconnectRequest,
    PairingReconnectRequestSchema,
    PairingReconnectResponseSchema,
    PairingTelemetryRequestSchema,
    PairingTelemetryResponseSchema,
    toPairingSessionSnapshotForRole,
} from '@viby/protocol/pairing'
import type { Context, Hono } from 'hono'
import { generatePairingSecret, hashPairingSecret, verifyPairingDeviceProof } from './crypto'
import {
    enforcePairingRateLimit,
    getClientAddress,
    logPairingAudit,
    rejectPairingCode,
    requirePairingIdentity,
} from './httpRouteSupport'
import { buildPairingUrls, createIceServers, getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { createJsonBodyValidator } from './httpValidation'

export function registerPairingReconnectRoutes(app: Hono, options: PairingHttpOptions): void {
    app.post(
        '/pairings/:id/reconnect-challenge',
        createJsonBodyValidator(PairingReconnectChallengeRequestSchema, 'Invalid pairing reconnect challenge body'),
        async (c) => {
            const rateLimitResponse = enforcePairingRateLimit(c, options, 'reconnect')
            if (rateLimitResponse) return rateLimitResponse

            const pairingId = c.req.param('id')
            const body = c.req.valid('json')
            const now = getNow(options.now)
            options.metrics?.increment('challenge_requests')

            const identity = await options.store.getSessionByTokenHash(hashPairingSecret(body.token))
            if (!identity || identity.session.id !== pairingId) {
                return rejectPairingCode(c, options, 'challenge_rejected', 403, 'pairing_invalid_token')
            }
            if (identity.session.state === 'deleted' || identity.session.state === 'expired') {
                return rejectPairingCode(c, options, 'challenge_rejected', 410, 'pairing_unavailable')
            }

            const challenge = await options.store.issueReconnectChallenge(pairingId, identity.role, {
                nonce: generatePairingSecret(24),
                issuedAt: now,
                expiresAt: now + options.reconnectChallengeTtlSeconds * 1000,
            })
            logPairingAudit(options, 'reconnect_challenge', { ip: getClientAddress(c), pairingId, role: identity.role })
            return c.json(PairingReconnectChallengeResponseSchema.parse({ role: identity.role, challenge }))
        }
    )

    app.post(
        '/pairings/:id/reconnect',
        createJsonBodyValidator(PairingReconnectRequestSchema, 'Invalid pairing reconnect body'),
        async (c) => {
            const rateLimitResponse = enforcePairingRateLimit(c, options, 'reconnect')
            if (rateLimitResponse) return rateLimitResponse

            const pairingId = c.req.param('id')
            const body = c.req.valid('json')
            const now = getNow(options.now)
            options.metrics?.increment('reconnect_requests')

            const tokenHash = hashPairingSecret(body.token)
            const identity = await options.store.getSessionByTokenHash(tokenHash)
            if (!identity || identity.session.id !== pairingId) {
                return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_token')
            }
            if (identity.session.state === 'deleted' || identity.session.state === 'expired') {
                return rejectPairingCode(c, options, 'reconnect_rejected', 410, 'pairing_unavailable')
            }

            if (identity.role === 'guest' && identity.session.guest?.publicKey) {
                const rejected = await verifyGuestReconnectProof({ c, pairingId, body, identity, now, options })
                if (rejected) return rejected
            }

            const renewedSession = await options.store.renewSession(
                pairingId,
                now + options.sessionTtlSeconds * 1000,
                now
            )
            if (!renewedSession) {
                return rejectPairingCode(c, options, 'reconnect_rejected', 410, 'pairing_unavailable')
            }

            logPairingAudit(options, 'reconnect', { ip: getClientAddress(c), pairingId, role: identity.role })
            return c.json(
                PairingReconnectResponseSchema.parse({
                    pairing: toPairingSessionSnapshotForRole(renewedSession, identity.role),
                    role: identity.role,
                    wsUrl: buildPairingUrls(options.publicUrl, pairingId, '', body.token).wsUrl,
                    iceServers: createIceServers(options, pairingId, now),
                })
            )
        }
    )

    app.post(
        '/pairings/:id/telemetry',
        createJsonBodyValidator(PairingTelemetryRequestSchema, 'Invalid pairing telemetry body'),
        async (c) => {
            const pairingId = c.req.param('id')
            const identity = await requirePairingIdentity({
                c,
                pairingId,
                expectedRole: 'host',
                rejectedMetric: 'telemetry_rejected',
                missingTokenError: 'Missing pairing token',
                invalidTokenError: 'Invalid pairing token',
                httpOptions: options,
            })
            if (identity instanceof Response) return identity

            const body = c.req.valid('json')
            options.metrics?.increment('telemetry_reports')
            options.metrics?.recordTelemetry(body.sample)
            return c.json(PairingTelemetryResponseSchema.parse({ accepted: true }))
        }
    )
}

type ReconnectIdentity = NonNullable<Awaited<ReturnType<PairingHttpOptions['store']['getSessionByTokenHash']>>>

type VerifyGuestReconnectProofOptions = {
    c: Context
    pairingId: string
    body: PairingReconnectRequest
    identity: ReconnectIdentity
    now: number
    options: PairingHttpOptions
}

async function verifyGuestReconnectProof({
    c,
    pairingId,
    body,
    identity,
    now,
    options,
}: VerifyGuestReconnectProofOptions): Promise<Response | null> {
    const proof = body.deviceProof
    const challengeNonce = proof?.challengeNonce ?? body.challengeNonce
    if (!proof || !challengeNonce || proof.challengeNonce !== challengeNonce) {
        return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
    }
    if (proof.publicKey !== identity.session.guest?.publicKey) {
        return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
    }

    const accepted = await options.store.consumeReconnectChallenge(pairingId, identity.role, challengeNonce, now)
    if (!accepted) {
        return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_reconnect_challenge_expired')
    }

    const verified = await verifyPairingDeviceProof({
        pairingId,
        challengeNonce,
        signedAt: proof.signedAt,
        publicKey: proof.publicKey,
        signature: proof.signature,
        now,
    })
    return verified ? null : rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
}
