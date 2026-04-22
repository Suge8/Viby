import {
    PairingReconnectChallengeRequestSchema,
    PairingReconnectChallengeResponseSchema,
    PairingReconnectRequestSchema,
    PairingReconnectResponseSchema,
    PairingTelemetryRequestSchema,
    PairingTelemetryResponseSchema,
    toPairingSessionSnapshot,
} from '@viby/protocol/pairing'
import type { Hono } from 'hono'
import { generatePairingSecret, hashPairingSecret, verifyPairingDeviceProof } from './crypto'
import {
    enforcePairingRateLimit,
    getClientAddress,
    logPairingAudit,
    rejectPairingRequest,
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
            if (rateLimitResponse) {
                return rateLimitResponse
            }
            const pairingId = c.req.param('id')
            const body = c.req.valid('json')
            options.metrics?.increment('challenge_requests')

            const now = getNow(options.now)
            const identity = await options.store.getSessionByTokenHash(hashPairingSecret(body.token))
            if (!identity || identity.session.id !== pairingId) {
                return rejectPairingRequest(c, options, 'challenge_rejected', 403, 'Invalid pairing token')
            }
            if (identity.session.state === 'deleted' || identity.session.state === 'expired') {
                return rejectPairingRequest(c, options, 'challenge_rejected', 410, 'Pairing session no longer active')
            }

            const challenge = await options.store.issueReconnectChallenge(pairingId, identity.role, {
                nonce: generatePairingSecret(24),
                issuedAt: now,
                expiresAt: now + options.reconnectChallengeTtlSeconds * 1000,
            })

            logPairingAudit(options, 'reconnect_challenge', {
                ip: getClientAddress(c),
                pairingId,
                role: identity.role,
            })

            return c.json(
                PairingReconnectChallengeResponseSchema.parse({
                    role: identity.role,
                    challenge,
                })
            )
        }
    )

    app.post(
        '/pairings/:id/reconnect',
        createJsonBodyValidator(PairingReconnectRequestSchema, 'Invalid pairing reconnect body'),
        async (c) => {
            const rateLimitResponse = enforcePairingRateLimit(c, options, 'reconnect')
            if (rateLimitResponse) {
                return rateLimitResponse
            }
            const pairingId = c.req.param('id')
            const body = c.req.valid('json')
            options.metrics?.increment('reconnect_requests')

            const now = getNow(options.now)
            const tokenHash = hashPairingSecret(body.token)
            const identity = await options.store.getSessionByTokenHash(tokenHash)

            if (!identity || identity.session.id !== pairingId) {
                return rejectPairingRequest(c, options, 'reconnect_rejected', 403, 'Invalid pairing token')
            }
            if (identity.session.state === 'deleted' || identity.session.state === 'expired') {
                return rejectPairingRequest(c, options, 'reconnect_rejected', 410, 'Pairing session no longer active')
            }

            if (identity.role === 'guest' && identity.session.guest?.publicKey) {
                const proof = body.deviceProof
                const challengeNonce = proof?.challengeNonce ?? body.challengeNonce
                if (!proof || !challengeNonce || proof.challengeNonce !== challengeNonce) {
                    return rejectPairingRequest(
                        c,
                        options,
                        'reconnect_rejected',
                        403,
                        'Missing or invalid device proof'
                    )
                }
                if (proof.publicKey !== identity.session.guest.publicKey) {
                    return rejectPairingRequest(
                        c,
                        options,
                        'reconnect_rejected',
                        403,
                        'Device proof verification failed'
                    )
                }

                const challengeAccepted = await options.store.consumeReconnectChallenge(
                    pairingId,
                    identity.role,
                    challengeNonce,
                    now
                )
                if (!challengeAccepted) {
                    return rejectPairingRequest(
                        c,
                        options,
                        'reconnect_rejected',
                        403,
                        'Missing or expired reconnect challenge'
                    )
                }

                const verified = await verifyPairingDeviceProof({
                    pairingId,
                    challengeNonce,
                    signedAt: proof.signedAt,
                    publicKey: proof.publicKey,
                    signature: proof.signature,
                    now,
                })
                if (!verified) {
                    return rejectPairingRequest(
                        c,
                        options,
                        'reconnect_rejected',
                        403,
                        'Device proof verification failed'
                    )
                }
            }

            logPairingAudit(options, 'reconnect', {
                ip: getClientAddress(c),
                pairingId,
                role: identity.role,
            })

            return c.json(
                PairingReconnectResponseSchema.parse({
                    pairing: toPairingSessionSnapshot(identity.session),
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
            if (identity instanceof Response) {
                return identity
            }

            const body = c.req.valid('json')
            options.metrics?.increment('telemetry_reports')
            options.metrics?.recordTelemetry(body.sample)

            return c.json(
                PairingTelemetryResponseSchema.parse({
                    accepted: true,
                })
            )
        }
    )
}
