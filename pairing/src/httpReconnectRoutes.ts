import {
    PairingClaimResponseSchema,
    PairingDeviceReconnectChallengeRequestSchema,
    PairingDeviceReconnectRequestSchema,
    PairingReconnectChallengeRequestSchema,
    PairingReconnectChallengeResponseSchema,
    PairingReconnectRequestSchema,
    PairingReconnectResponseSchema,
    PairingTelemetryRequestSchema,
    PairingTelemetryResponseSchema,
    toPairingSessionSnapshotForRole,
} from '@viby/protocol/pairing'
import type { Hono } from 'hono'
import { generatePairingSecret, hashPairingSecret } from './crypto'
import { verifyStoredPairingDeviceProof } from './httpDeviceProofSupport'
import {
    enforcePairingRateLimit,
    getClientAddress,
    logPairingAudit,
    rejectPairingCode,
    requirePairingIdentity,
} from './httpRouteSupport'
import { buildPairingUrls, createIceServers, createParticipantRecord, getNow } from './httpSupport'
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
        '/pairings/:id/device-reconnect-challenge',
        createJsonBodyValidator(
            PairingDeviceReconnectChallengeRequestSchema,
            'Invalid pairing device reconnect challenge body'
        ),
        async (c) => {
            const rateLimitResponse = enforcePairingRateLimit(c, options, 'reconnect')
            if (rateLimitResponse) return rateLimitResponse

            const pairingId = c.req.param('id')
            const body = c.req.valid('json')
            const now = getNow(options.now)
            options.metrics?.increment('challenge_requests')

            const session = await options.store.getSession(pairingId)
            if (!session || session.state === 'deleted' || session.state === 'expired') {
                return rejectPairingCode(c, options, 'challenge_rejected', 410, 'pairing_unavailable')
            }
            if (session.approvalStatus !== 'approved' || session.guest?.publicKey !== body.publicKey) {
                return rejectPairingCode(c, options, 'challenge_rejected', 403, 'pairing_invalid_device_proof')
            }

            const challenge = await options.store.issueReconnectChallenge(pairingId, 'guest', {
                nonce: generatePairingSecret(24),
                issuedAt: now,
                expiresAt: now + options.reconnectChallengeTtlSeconds * 1000,
            })
            logPairingAudit(options, 'device_reconnect_challenge', { ip: getClientAddress(c), pairingId })
            return c.json(PairingReconnectChallengeResponseSchema.parse({ role: 'guest', challenge }))
        }
    )

    app.post(
        '/pairings/:id/device-reconnect',
        createJsonBodyValidator(PairingDeviceReconnectRequestSchema, 'Invalid pairing device reconnect body'),
        async (c) => {
            const rateLimitResponse = enforcePairingRateLimit(c, options, 'reconnect')
            if (rateLimitResponse) return rateLimitResponse

            const pairingId = c.req.param('id')
            const body = c.req.valid('json')
            const now = getNow(options.now)
            options.metrics?.increment('reconnect_requests')

            const session = await options.store.getSession(pairingId)
            if (!session || session.state === 'deleted' || session.state === 'expired') {
                return rejectPairingCode(c, options, 'reconnect_rejected', 410, 'pairing_unavailable')
            }
            if (session.approvalStatus !== 'approved' || session.guest?.publicKey !== body.deviceProof.publicKey) {
                return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
            }

            const proofFailure = await verifyStoredPairingDeviceProof({
                pairingId,
                role: 'guest',
                proof: body.deviceProof,
                expectedPublicKey: session.guest.publicKey,
                now,
                store: options.store,
            })
            if (proofFailure === 'invalid') {
                return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
            }
            if (proofFailure === 'challenge-expired') {
                return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_reconnect_challenge_expired')
            }

            const guestToken = generatePairingSecret()
            const renewedSession = await options.store.renewSession(
                pairingId,
                now + options.sessionTtlSeconds * 1000,
                now
            )
            const guest = renewedSession?.guest
            if (!guest) {
                return rejectPairingCode(c, options, 'reconnect_rejected', 410, 'pairing_unavailable')
            }

            const recovered = await options.store.rotateGuestToken(
                pairingId,
                createParticipantRecord({
                    token: guestToken,
                    label: guest.label,
                    publicKey: guest.publicKey,
                    metadata: guest.metadata,
                }),
                now
            )
            if (!recovered) {
                return rejectPairingCode(c, options, 'reconnect_rejected', 410, 'pairing_unavailable')
            }

            logPairingAudit(options, 'device_reconnect', { ip: getClientAddress(c), pairingId })
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

            if (identity.role === 'guest') {
                const expectedPublicKey = identity.session.guest?.publicKey ?? body.deviceProof?.publicKey
                if (expectedPublicKey) {
                    const proofFailure = await verifyStoredPairingDeviceProof({
                        pairingId,
                        role: identity.role,
                        challengeNonce: body.challengeNonce,
                        proof: body.deviceProof,
                        expectedPublicKey,
                        now,
                        store: options.store,
                    })
                    if (proofFailure === 'invalid') {
                        return rejectPairingCode(c, options, 'reconnect_rejected', 403, 'pairing_invalid_device_proof')
                    }
                    if (proofFailure === 'challenge-expired') {
                        return rejectPairingCode(
                            c,
                            options,
                            'reconnect_rejected',
                            403,
                            'pairing_reconnect_challenge_expired'
                        )
                    }
                    if (!identity.session.guest?.publicKey) {
                        const bound = await options.store.bindGuestDeviceKey(pairingId, expectedPublicKey, now)
                        if (!bound) {
                            return rejectPairingCode(
                                c,
                                options,
                                'reconnect_rejected',
                                403,
                                'pairing_invalid_device_proof'
                            )
                        }
                    }
                }
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
            const urls = buildPairingUrls(options.publicUrl, pairingId, '', body.token)
            return c.json(
                PairingReconnectResponseSchema.parse({
                    pairing: toPairingSessionSnapshotForRole(renewedSession, identity.role),
                    role: identity.role,
                    wsUrl: urls.wsUrl,
                    tunnelUrl: urls.tunnelUrl,
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
