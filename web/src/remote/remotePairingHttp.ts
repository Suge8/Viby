import {
    PairingDeviceReconnectChallengeRequestSchema,
    PairingDeviceReconnectRequestSchema,
    type PairingGuestAuthResponse,
    PairingGuestAuthResponseSchema,
    type PairingHttpErrorCode,
    type PairingLanVerifyCodeResponse,
    PairingLanVerifyCodeResponseSchema,
    PairingPwaHandoffClaimRequestSchema,
    PairingPwaHandoffTicketRequestSchema,
    PairingPwaHandoffTicketResponseSchema,
    PairingReconnectChallengeResponseSchema,
    type PairingReconnectResponse,
    PairingReconnectResponseSchema,
} from '@viby/protocol'
import { DEVICE_PLATFORM_DISPLAY_LABELS, resolveClientPlatform } from '@/lib/clientPlatform'
import { loadClaimDeviceIdentity } from '@/remote/remotePairingClaimIdentity'
import {
    createReconnectDeviceProof,
    loadCachedPairingDeviceIdentity,
    loadPairingDeviceIdentity,
} from '@/remote/remotePairingDevice'
import { requestRemotePairingPersistentStorage } from '@/remote/remotePairingStoragePersistence'
import type { RemotePairingErrorKey } from './remotePairingErrors'
import {
    clearStoredGuestToken as clearStoredGuestTokenStorage,
    readStoredGuestToken,
    storeGuestToken,
} from './remotePairingHttpStorage'

export {
    clearRemotePairingId,
    clearStoredGuestToken,
    getPairingHandoffTicketFromLocation,
    getPairingTokenKey,
    readRemotePairingId,
    readRemotePairingPathId,
    readStoredRemotePairingId,
    rememberRemotePairingId,
    scrubPairingLaunchSecretFromUrl,
} from './remotePairingHttpStorage'

/**
 * Discriminator for the final post-verify outcome. Broker mode keeps the
 * WebRTC bridge contract; LAN mode hands the phone a hub device token + secret
 * so it can connect directly to the local hub workspace.
 */
export type PairingRemoteVerifyResult =
    | { mode: 'broker'; auth: PairingGuestAuthResponse }
    | { mode: 'lan'; auth: PairingLanVerifyCodeResponse }

export type PairingRemoteAuth = PairingGuestAuthResponse | PairingReconnectResponse

type PairingHttpContext = 'handoff' | 'reconnect' | 'verifyCode'

const PAIRING_HTTP_TIMEOUT_MS = 8_000

export class RemotePairingHttpError extends Error {
    constructor(
        readonly status: number,
        readonly code: RemotePairingErrorKey,
        readonly serverError: string | null = null,
        readonly serverCode: PairingHttpErrorCode | null = null
    ) {
        super(code)
        this.name = 'RemotePairingHttpError'
    }
}

/**
 * Stored guest token is only invalid when broker proves it is. The 410 with
 * code `pairing_reconnect_challenge_expired` is a 60s nonce timeout on a
 * still-valid token: wiping the token there used to bounce cellular hand-over
 * users to the rescan screen even though the broker session was alive.
 */
export function isInvalidStoredPairingCredential(error: RemotePairingHttpError): boolean {
    if (error.status === 410) {
        return error.serverCode !== 'pairing_reconnect_challenge_expired'
    }
    if (error.status === 403) {
        return (
            error.serverCode === 'pairing_invalid_token' ||
            error.serverCode === 'pairing_invalid_device_proof' ||
            (!error.serverCode &&
                (error.serverError === 'Invalid pairing token' ||
                    error.serverError === 'Missing or invalid device proof' ||
                    error.serverError === 'Device proof verification failed'))
        )
    }
    return false
}

async function postJson<T>(
    context: PairingHttpContext,
    path: string,
    body: unknown,
    parse: (value: unknown) => T
): Promise<T> {
    let response: Response
    try {
        response = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(PAIRING_HTTP_TIMEOUT_MS),
        })
    } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
            throw new RemotePairingHttpError(408, resolvePairingHttpErrorKey(context, 408, null))
        }
        throw error
    }
    const payload = await readJsonPayload(response)
    if (!response.ok) {
        throw new RemotePairingHttpError(
            response.status,
            resolvePairingHttpErrorKey(context, response.status, payload),
            readPayloadField(payload, 'error'),
            readPairingHttpErrorCode(payload)
        )
    }
    return parse(payload)
}

function readPayloadField(payload: unknown, field: 'code' | 'error' | 'message'): string | null {
    if (!payload || typeof payload !== 'object') return null
    const value = (payload as Record<string, unknown>)[field]
    return typeof value === 'string' ? value : null
}

function readPairingHttpErrorCode(payload: unknown): PairingHttpErrorCode | null {
    const code = readPayloadField(payload, 'code')
    switch (code) {
        case 'pairing_invalid_token':
        case 'pairing_unavailable':
        case 'pairing_invalid_device_proof':
        case 'pairing_reconnect_challenge_expired':
        case 'pairing_invalid_handoff_ticket':
        case 'pairing_rate_limited':
            return code
        default:
            return null
    }
}

function isInvalidVerificationCode(status: number, payload: unknown): boolean {
    const code = readPayloadField(payload, 'code')
    return code === 'pairing_invalid_code' || (status === 403 && code !== 'pairing_invalid_token')
}

function resolvePairingHttpErrorKey(
    context: PairingHttpContext,
    status: number,
    payload: unknown
): RemotePairingErrorKey {
    if (status === 429 || readPayloadField(payload, 'code') === 'pairing_rate_limited') {
        return 'remotePairing.error.rateLimited'
    }
    if (context === 'verifyCode') {
        return isInvalidVerificationCode(status, payload)
            ? 'remotePairing.error.invalidCode'
            : 'remotePairing.error.scanAgain'
    }
    return status >= 500 || status === 408 ? 'remotePairing.error.closedRetrying' : 'remotePairing.error.scanAgain'
}

async function readJsonPayload(response: Response): Promise<unknown> {
    try {
        return await response.json()
    } catch {
        return null
    }
}

/**
 * Single-step Google device-flow verification. Tries the broker endpoint
 * first; on `404 pairing_not_found` falls back to the hub LAN endpoint. The
 * active mode is returned so the controller can branch between WebRTC bridge
 * (broker) and hub device-token install (LAN).
 */
export async function verifyRemotePairingCode(pairingId: string, code: string): Promise<PairingRemoteVerifyResult> {
    const identity = await loadClaimDeviceIdentity(pairingId)
    const platform = resolveClientPlatform()
    const body = {
        code,
        label: DEVICE_PLATFORM_DISPLAY_LABELS[platform],
        publicKey: identity.publicKey,
        metadata: { platform },
        deviceName: DEVICE_PLATFORM_DISPLAY_LABELS[platform],
        platform,
    }
    try {
        const auth = await postJson(
            'verifyCode',
            `/pairings/${encodeURIComponent(pairingId)}/verify-code`,
            body,
            (payload) => PairingGuestAuthResponseSchema.parse(payload)
        )
        storeGuestToken(pairingId, auth.guestToken)
        await requestRemotePairingPersistentStorage()
        return { mode: 'broker', auth }
    } catch (error) {
        if (!(error instanceof RemotePairingHttpError && error.status === 404)) throw error
    }
    const auth = await postJson(
        'verifyCode',
        `/api/lan-pairings/${encodeURIComponent(pairingId)}/verify-code`,
        body,
        (payload) => PairingLanVerifyCodeResponseSchema.parse(payload)
    )
    await requestRemotePairingPersistentStorage()
    return { mode: 'lan', auth }
}

export async function recoverRemotePairingByDevice(pairingId: string): Promise<PairingGuestAuthResponse | null> {
    const identity = await loadCachedPairingDeviceIdentity(pairingId)
    if (!identity) return null

    const challengeResponse = await postJson(
        'reconnect',
        `/pairings/${encodeURIComponent(pairingId)}/device-reconnect-challenge`,
        PairingDeviceReconnectChallengeRequestSchema.parse({ publicKey: identity.publicKey }),
        (payload) => PairingReconnectChallengeResponseSchema.parse(payload)
    )
    const deviceProof = await createReconnectDeviceProof(pairingId, identity, challengeResponse.challenge.nonce)
    const response = await postJson(
        'reconnect',
        `/pairings/${encodeURIComponent(pairingId)}/device-reconnect`,
        PairingDeviceReconnectRequestSchema.parse({ deviceProof }),
        (payload) => PairingGuestAuthResponseSchema.parse(payload)
    )
    storeGuestToken(pairingId, response.guestToken)
    await requestRemotePairingPersistentStorage()
    return response
}

export async function createRemotePwaHandoff(
    pairingId: string
): Promise<{ expiresAt: number; handoffTicket: string } | null> {
    const token = readStoredGuestToken(pairingId)
    if (!token) return null

    const identity = await loadPairingDeviceIdentity(pairingId)
    const challengeResponse = await postJson(
        'reconnect',
        `/pairings/${encodeURIComponent(pairingId)}/reconnect-challenge`,
        { token },
        (payload) => PairingReconnectChallengeResponseSchema.parse(payload)
    )
    const deviceProof = await createReconnectDeviceProof(pairingId, identity, challengeResponse.challenge.nonce)
    const response = await postJson(
        'handoff',
        `/pairings/${encodeURIComponent(pairingId)}/pwa-handoff-ticket`,
        PairingPwaHandoffTicketRequestSchema.parse({ token, deviceProof }),
        (payload) => PairingPwaHandoffTicketResponseSchema.parse(payload)
    )
    return response
}

export async function claimRemotePwaHandoff(
    pairingId: string,
    handoffTicket: string
): Promise<PairingGuestAuthResponse> {
    const identity = await loadPairingDeviceIdentity(pairingId)
    const platform = resolveClientPlatform()
    const response = await postJson(
        'handoff',
        `/pairings/${encodeURIComponent(pairingId)}/pwa-handoff-claim`,
        PairingPwaHandoffClaimRequestSchema.parse({
            handoffTicket,
            label: DEVICE_PLATFORM_DISPLAY_LABELS[platform],
            publicKey: identity.publicKey,
        }),
        (payload) => PairingGuestAuthResponseSchema.parse(payload)
    )
    storeGuestToken(pairingId, response.guestToken)
    await requestRemotePairingPersistentStorage()
    return response
}

export async function reconnectRemotePairing(pairingId: string): Promise<PairingReconnectResponse | null> {
    const token = readStoredGuestToken(pairingId)
    if (!token) {
        return null
    }

    try {
        const identity = await loadPairingDeviceIdentity(pairingId)
        const challengeResponse = await postJson(
            'reconnect',
            `/pairings/${encodeURIComponent(pairingId)}/reconnect-challenge`,
            { token },
            (payload) => PairingReconnectChallengeResponseSchema.parse(payload)
        )
        const deviceProof = await createReconnectDeviceProof(pairingId, identity, challengeResponse.challenge.nonce)
        const response = await postJson(
            'reconnect',
            `/pairings/${encodeURIComponent(pairingId)}/reconnect`,
            { token, deviceProof },
            (payload) => PairingReconnectResponseSchema.parse(payload)
        )
        await requestRemotePairingPersistentStorage()
        return response
    } catch (error) {
        if (error instanceof RemotePairingHttpError && isInvalidStoredPairingCredential(error)) {
            clearStoredGuestTokenStorage(pairingId)
        }
        throw error
    }
}

export function getGuestToken(auth: PairingRemoteAuth): string | null {
    return 'guestToken' in auth ? auth.guestToken : readStoredGuestToken(auth.pairing.id)
}
