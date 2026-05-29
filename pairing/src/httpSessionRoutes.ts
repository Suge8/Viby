import {
    type PairingCreateRequest,
    PairingCreateResponseSchema,
    PairingDeleteResponseSchema,
    PairingGuestAuthResponseSchema,
    type PairingHostEvent,
    PairingStatusResponseSchema,
    type PairingVerifyCodeRequest,
    toPairingSessionSnapshot,
    toPairingSessionSnapshotForRole,
} from '@viby/protocol/pairing'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { generatePairingSecret, hashPairingSecret } from './crypto'
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
    verifyCodeBodyValidator: ReturnType<typeof createJsonBodyValidator<PairingVerifyCodeRequest>>
}

const SSE_KEEPALIVE_INTERVAL_MS = 25_000

export function registerPairingSessionRoutes(
    app: Hono,
    options: PairingHttpOptions,
    validators: PairingSessionRouteValidators
): void {
    app.get('/pairings/:id', async (c) => {
        const pairingId = c.req.param('id')
        const identity = await requirePairingIdentity({
            c,
            pairingId,
            rejectedMetric: 'verify_rejected',
            missingTokenError: 'Missing pairing token',
            invalidTokenError: 'Invalid pairing token',
            httpOptions: options,
        })
        if (identity instanceof Response) return identity

        const session = await options.store.getSession(pairingId)
        if (!session) {
            return rejectPairingRequest(c, options, 'verify_rejected', 404, 'Pairing session not found')
        }

        return c.json(
            PairingStatusResponseSchema.parse({
                pairing: toPairingSessionSnapshotForRole(session, identity.role),
            })
        )
    })

    app.post('/pairings', validators.createPairingBodyValidator, async (c) => {
        const authError = authorizeCreateRequest(options, c.req.header('authorization'))
        if (authError) return authError
        const rateLimitResponse = enforcePairingRateLimit(c, options, 'create')
        if (rateLimitResponse) return rateLimitResponse
        const body = c.req.valid('json')
        options.metrics?.increment('create_requests')

        const now = getNow(options.now)
        const created = createPairingSessionRecord(body, { now, sessionTtlSeconds: options.sessionTtlSeconds })
        const stored = await options.store.createSession(created.session)
        const urls = buildPairingUrls(options.publicUrl, stored.id, created.hostToken)
        const response = PairingCreateResponseSchema.parse({
            pairing: toPairingSessionSnapshot(stored),
            hostToken: created.hostToken,
            pairingUrl: urls.pairingUrl,
            wsUrl: urls.wsUrl,
            tunnelUrl: urls.tunnelUrl,
            eventsUrl: urls.eventsUrl,
            iceServers: createIceServers(options),
        })

        logPairingAudit(options, 'create', {
            ip: getClientAddress(c),
            pairingId: stored.id,
            label: body.label ?? null,
        })
        return c.json(response)
    })

    app.post('/pairings/:id/verify-code', validators.verifyCodeBodyValidator, async (c) => {
        const rateLimitResponse = enforcePairingRateLimit(c, options, 'verify')
        if (rateLimitResponse) return rateLimitResponse
        const pairingId = c.req.param('id')
        const body = c.req.valid('json')
        options.metrics?.increment('verify_requests')

        const now = getNow(options.now)
        const session = await options.store.getSession(pairingId)
        if (!session) {
            return rejectPairingRequest(c, options, 'verify_rejected', 404, 'Pairing session not found')
        }
        if (session.state === 'deleted' || session.state === 'expired') {
            return rejectPairingRequest(c, options, 'verify_rejected', 410, 'Pairing session no longer active')
        }
        if (session.guest || session.approvalStatus === 'approved') {
            return rejectPairingRequest(c, options, 'verify_rejected', 409, 'Pairing session already claimed')
        }
        if (session.shortCode === null || session.shortCode !== body.code) {
            return rejectPairingRequest(c, options, 'verify_rejected', 403, '数字不对，请看电脑上的 6 位数字')
        }

        const guestToken = generatePairingSecret()
        const guest = createParticipantRecord({
            token: guestToken,
            label: body.label,
            publicKey: body.publicKey,
            metadata: body.metadata,
        })
        const approved = await options.store.claimAndApprove(pairingId, body.code, guest, now)
        if (!approved) {
            return rejectPairingRequest(c, options, 'verify_rejected', 409, 'Pairing session could not be claimed')
        }

        options.eventBus.emitUpdate(approved)

        const urls = buildPairingUrls(options.publicUrl, approved.id, guestToken)
        const response = PairingGuestAuthResponseSchema.parse({
            pairing: toPairingSessionSnapshotForRole(approved, 'guest'),
            guestToken,
            wsUrl: urls.wsUrl,
            tunnelUrl: urls.tunnelUrl,
            iceServers: createIceServers(options),
        })

        logPairingAudit(options, 'verify', {
            ip: getClientAddress(c),
            pairingId,
            guestLabel: body.label ?? null,
            shortCode: approved.shortCode,
        })

        return c.json(response)
    })

    app.delete('/pairings/:id', async (c) => {
        const pairingId = c.req.param('id')
        options.metrics?.increment('delete_requests')
        const identity = await requirePairingIdentity({
            c,
            pairingId,
            expectedRole: 'host',
            rejectedMetric: 'delete_rejected',
            missingTokenError: 'Missing pairing token',
            invalidTokenError: 'Invalid pairing token',
            httpOptions: options,
        })
        if (identity instanceof Response) return identity

        const deleted = await options.store.deleteSession(pairingId, getNow(options.now))
        if (!deleted) {
            return rejectPairingRequest(c, options, 'delete_rejected', 404, 'Pairing session not found')
        }

        await options.socketHub.notifyBye(pairingId, 'user_revoked')
        options.eventBus.emitUpdate(deleted)
        logPairingAudit(options, 'delete', { ip: getClientAddress(c), pairingId, role: identity.role })

        return c.json(PairingDeleteResponseSchema.parse({ deleted: true, pairing: toPairingSessionSnapshot(deleted) }))
    })

    app.get('/pairings/:id/events', async (c) => {
        const pairingId = c.req.param('id')
        const identity = await requirePairingIdentity({
            c,
            pairingId,
            expectedRole: 'host',
            rejectedMetric: 'verify_rejected',
            missingTokenError: 'Missing pairing token',
            invalidTokenError: 'Invalid pairing token',
            httpOptions: options,
        })
        if (identity instanceof Response) return identity

        // Disable upstream buffering: openresty / nginx default `proxy_buffering on`
        // would queue the entire stream and never deliver `pairing.updated`
        // events to the host while the channel stays open. Cloudflare reads the
        // same hint. Without this header, the host (desktop) never learns the
        // guest approved the code, the bridge never starts, and the guest's
        // browser sits forever on the connecting splash.
        c.header('X-Accel-Buffering', 'no')
        c.header('Cache-Control', 'no-cache, no-transform')

        return streamSSE(c, async (stream) => {
            let frame = 0
            const pending: PairingHostEvent[] = []
            let notify: (() => void) | null = null

            const unsubscribe = options.eventBus.subscribe(pairingId, (event) => {
                pending.push(event)
                notify?.()
            })

            // Emit the current snapshot once on connect so the host renders
            // the right state even when verify happened during reconnect.
            const initial = await options.store.getSession(pairingId)
            if (initial) {
                pending.push({ type: 'pairing.updated', pairing: toPairingSessionSnapshot(initial) })
            }

            stream.onAbort(() => {
                unsubscribe()
                notify?.()
            })

            try {
                while (!stream.aborted && !stream.closed) {
                    if (pending.length === 0) {
                        await Promise.race([
                            new Promise<void>((resolve) => {
                                notify = resolve
                            }),
                            stream.sleep(SSE_KEEPALIVE_INTERVAL_MS),
                        ])
                        notify = null
                        if (pending.length === 0 && !stream.aborted && !stream.closed) {
                            await stream.writeSSE({ event: 'keepalive', data: '' })
                            continue
                        }
                    }
                    const next = pending.shift()
                    if (!next) continue
                    frame += 1
                    await stream.writeSSE({ event: next.type, data: JSON.stringify(next), id: String(frame) })
                }
            } finally {
                unsubscribe()
            }
        })
    })
}
