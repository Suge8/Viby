import {
    PairingApproveResponseSchema,
    type PairingClaimRequest,
    PairingClaimResponseSchema,
    type PairingCreateRequest,
    PairingCreateResponseSchema,
    PairingDeleteResponseSchema,
    toPairingSessionSnapshot,
} from '@viby/protocol/pairing'
import type { Hono } from 'hono'
import { generatePairingSecret, generatePairingShortCode, hashPairingSecret, isMatchingSecretHash } from './crypto'
import {
    enforcePairingRateLimit,
    getClientAddress,
    logPairingAudit,
    rejectPairingRequest,
    requirePairingIdentity,
} from './httpRouteSupport'
import {
    authorizeCreateRequest,
    buildPairingUrls,
    createIceServers,
    createPairingSessionRecord,
    createParticipantRecord,
    getNow,
} from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { createJsonBodyValidator } from './httpValidation'

type PairingSessionRouteValidators = {
    createPairingBodyValidator: ReturnType<typeof createJsonBodyValidator<PairingCreateRequest>>
    claimPairingBodyValidator: ReturnType<typeof createJsonBodyValidator<PairingClaimRequest>>
}

export function registerPairingSessionRoutes(
    app: Hono,
    options: PairingHttpOptions,
    validators: PairingSessionRouteValidators
): void {
    app.post('/pairings', validators.createPairingBodyValidator, async (c) => {
        const authError = authorizeCreateRequest(options, c.req.header('authorization'))
        if (authError) {
            return authError
        }
        const rateLimitResponse = enforcePairingRateLimit(c, options, 'create')
        if (rateLimitResponse) {
            return rateLimitResponse
        }
        const body = c.req.valid('json')
        options.metrics?.increment('create_requests')

        const now = getNow(options.now)
        const created = createPairingSessionRecord(body, {
            now,
            sessionTtlSeconds: options.sessionTtlSeconds,
            ticketTtlSeconds: options.ticketTtlSeconds,
        })
        const stored = await options.store.createSession(created.session)
        const urls = buildPairingUrls(options.publicUrl, stored.id, created.ticket, created.hostToken)
        const response = PairingCreateResponseSchema.parse({
            pairing: toPairingSessionSnapshot(stored),
            hostToken: created.hostToken,
            pairingUrl: urls.pairingUrl,
            wsUrl: urls.wsUrl,
            iceServers: createIceServers(options, stored.id, now),
        })

        logPairingAudit(options, 'create', {
            ip: getClientAddress(c),
            pairingId: stored.id,
            label: body.label ?? null,
        })
        return c.json(response)
    })

    app.post('/pairings/:id/claim', validators.claimPairingBodyValidator, async (c) => {
        const rateLimitResponse = enforcePairingRateLimit(c, options, 'claim')
        if (rateLimitResponse) {
            return rateLimitResponse
        }
        const pairingId = c.req.param('id')
        const body = c.req.valid('json')
        options.metrics?.increment('claim_requests')

        const now = getNow(options.now)
        const session = await options.store.getSession(pairingId)

        if (!session) {
            return rejectPairingRequest(c, options, 'claim_rejected', 404, 'Pairing session not found')
        }
        if (session.state === 'deleted' || session.state === 'expired') {
            return rejectPairingRequest(c, options, 'claim_rejected', 410, 'Pairing session no longer active')
        }
        if (now > session.ticketExpiresAt) {
            return rejectPairingRequest(c, options, 'claim_rejected', 410, 'Pairing ticket expired')
        }

        if (session.guest) {
            return rejectPairingRequest(c, options, 'claim_rejected', 409, 'Pairing ticket already used')
        }

        if (!isMatchingSecretHash(session.ticketHash, body.ticket)) {
            return rejectPairingRequest(c, options, 'claim_rejected', 401, 'Invalid pairing ticket')
        }

        const guestToken = generatePairingSecret()
        const guest = createParticipantRecord({
            token: guestToken,
            label: body.label,
            publicKey: body.publicKey,
            metadata: body.metadata,
        })

        const stored = await options.store.claimSession(pairingId, guest, generatePairingShortCode())
        if (!stored) {
            return rejectPairingRequest(c, options, 'claim_rejected', 409, 'Pairing session could not be claimed')
        }

        options.socketHub.broadcastState(pairingId, stored)

        const response = PairingClaimResponseSchema.parse({
            pairing: toPairingSessionSnapshot(stored),
            guestToken,
            wsUrl: buildPairingUrls(options.publicUrl, stored.id, '', guestToken).wsUrl,
            iceServers: createIceServers(options, stored.id, now),
        })

        logPairingAudit(options, 'claim', {
            ip: getClientAddress(c),
            pairingId,
            guestLabel: body.label ?? null,
            shortCode: stored.shortCode,
        })

        return c.json(response)
    })

    app.delete('/pairings/:id', async (c) => {
        const pairingId = c.req.param('id')
        options.metrics?.increment('delete_requests')
        const identity = await requirePairingIdentity({
            c,
            pairingId,
            rejectedMetric: 'delete_rejected',
            missingTokenError: 'Missing pairing token',
            invalidTokenError: 'Invalid pairing token',
            httpOptions: options,
        })
        if (identity instanceof Response) {
            return identity
        }

        const deleted = await options.store.deleteSession(pairingId, getNow(options.now))
        if (!deleted) {
            return rejectPairingRequest(c, options, 'delete_rejected', 404, 'Pairing session not found')
        }

        await options.socketHub.closeSession(pairingId, deleted, 'deleted')
        logPairingAudit(options, 'delete', {
            ip: getClientAddress(c),
            pairingId,
            role: identity.role,
        })

        return c.json(
            PairingDeleteResponseSchema.parse({
                deleted: true,
                pairing: toPairingSessionSnapshot(deleted),
            })
        )
    })

    app.post('/pairings/:id/approve', async (c) => {
        const rateLimitResponse = enforcePairingRateLimit(c, options, 'approve')
        if (rateLimitResponse) {
            return rateLimitResponse
        }
        const pairingId = c.req.param('id')
        options.metrics?.increment('approve_requests')
        const identity = await requirePairingIdentity({
            c,
            pairingId,
            expectedRole: 'host',
            rejectedMetric: 'approve_rejected',
            missingTokenError: 'Missing pairing token',
            invalidTokenError: 'Invalid pairing token',
            httpOptions: options,
        })
        if (identity instanceof Response) {
            return identity
        }

        const approved = await options.store.approveSession(pairingId, getNow(options.now))
        if (!approved) {
            return rejectPairingRequest(
                c,
                options,
                'approve_rejected',
                409,
                'Pairing session is not ready for approval'
            )
        }

        options.socketHub.broadcastState(pairingId, approved)
        logPairingAudit(options, 'approve', {
            ip: getClientAddress(c),
            pairingId,
            shortCode: approved.shortCode,
        })

        return c.json(
            PairingApproveResponseSchema.parse({
                pairing: toPairingSessionSnapshot(approved),
            })
        )
    })

    app.get(
        '/pairings/:id/ws',
        options.upgradeWebSocket((c) => {
            const pairingId = c.req.param('id')
            const token = c.req.query('token')
            const tokenHash = token ? hashPairingSecret(token) : null

            return {
                async onOpen(_event, ws) {
                    if (!tokenHash) {
                        ws.close(1008, 'missing-token')
                        return
                    }

                    await options.socketHub.attach(pairingId, tokenHash, ws)
                },
                async onMessage(event, ws) {
                    await options.socketHub.handleMessage(ws, event.data)
                },
                async onClose(_event, ws) {
                    await options.socketHub.detach(ws)
                },
                onError(error) {
                    options.logger?.error?.('[Pairing] WebSocket error:', error)
                },
            }
        })
    )
}
