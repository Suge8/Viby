import {
    type PairingCreateRequest,
    PairingCreateResponseSchema,
    PairingDeleteResponseSchema,
    PairingGuestAuthResponseSchema,
    PairingStatusResponseSchema,
    type PairingVerifyCodeRequest,
    toPairingSessionSnapshot,
    toPairingSessionSnapshotForRole,
} from '@viby/protocol/pairing'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { generatePairingSecret, hashPairingSecret } from './crypto'
import { buildPairingHostEventFromStore, toRemoteConnectionSnapshots } from './hostEventPayload'
import { createPairingHostEventStream } from './hostEventStream'
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
    createRemoteConnectionDraft,
    getNow,
} from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { createJsonBodyValidator } from './httpValidation'
import { buildPairingManifestCookieHeaderForPairing } from './manifestCookie'

type PairingSessionRouteValidators = {
    createPairingBodyValidator: ReturnType<typeof createJsonBodyValidator<PairingCreateRequest>>
    verifyCodeBodyValidator: ReturnType<typeof createJsonBodyValidator<PairingVerifyCodeRequest>>
}

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
                remoteConnections: toRemoteConnectionSnapshots(
                    await options.store.getRemoteConnections(pairingId),
                    options.socketHub.getActiveRemoteConnectionIds(pairingId)
                ),
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
        if (session.authorizedDevice || session.approvalStatus === 'approved') {
            return rejectPairingRequest(c, options, 'verify_rejected', 409, 'Pairing session already approved')
        }
        if (session.shortCode === null || session.shortCode !== body.code) {
            return rejectPairingRequest(c, options, 'verify_rejected', 403, '数字不对，请看电脑上的 6 位数字')
        }

        const guestToken = generatePairingSecret()
        const guestConnection = createRemoteConnectionDraft({
            token: guestToken,
            label: body.label,
            publicKey: body.publicKey,
            metadata: body.metadata,
        })
        const approved = await options.store.verifyCodeAndApprove(
            pairingId,
            body.code,
            {
                id: body.publicKey,
                publicKey: body.publicKey,
                label: body.label,
                metadata: body.metadata,
                authorizedAt: now,
                lastSeenAt: now,
            },
            guestConnection,
            now
        )
        if (!approved) {
            return rejectPairingRequest(c, options, 'verify_rejected', 409, 'Pairing session could not be approved')
        }

        options.eventBus.emit(
            await buildPairingHostEventFromStore(options.store, approved, (pairingId) =>
                options.socketHub.getActiveRemoteConnectionIds(pairingId)
            )
        )

        const urls = buildPairingUrls(options.publicUrl, approved.id, guestToken)
        const response = PairingGuestAuthResponseSchema.parse({
            pairing: toPairingSessionSnapshotForRole(approved, 'guest'),
            guestToken,
            wsUrl: urls.wsUrl,
            tunnelUrl: urls.tunnelUrl,
            iceServers: createIceServers(options),
        })

        c.header(
            'set-cookie',
            buildPairingManifestCookieHeaderForPairing({
                maxAgeSeconds: options.manifestCookieTtlSeconds,
                nowMs: now,
                pairingId,
                signer: options.manifestCookieSigner,
            }),
            { append: true }
        )

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
        options.eventBus.emit(
            await buildPairingHostEventFromStore(options.store, deleted, (pairingId) =>
                options.socketHub.getActiveRemoteConnectionIds(pairingId)
            )
        )
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
            const abortController = new AbortController()
            stream.onAbort(() => abortController.abort())

            for await (const item of createPairingHostEventStream({
                pairingId,
                store: options.store,
                eventBus: options.eventBus,
                getActiveRemoteConnectionIds: (pairingId) => options.socketHub.getActiveRemoteConnectionIds(pairingId),
                signal: abortController.signal,
            })) {
                if (stream.aborted || stream.closed) break
                if (item.type === 'keepalive') {
                    await stream.writeSSE({ event: 'keepalive', data: '' })
                    continue
                }
                frame += 1
                await stream.writeSSE({
                    event: item.event.type,
                    data: JSON.stringify(item.event),
                    id: String(frame),
                })
            }
        })
    })
}
