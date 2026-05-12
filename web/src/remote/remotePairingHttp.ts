import {
    hasPairingWorkspaceIntent,
    PAIRING_PWA_HANDOFF_PARAM,
    type PairingClaimResponse,
    PairingClaimResponseSchema,
    PairingDeviceReconnectChallengeRequestSchema,
    PairingDeviceReconnectRequestSchema,
    type PairingHttpErrorCode,
    PairingPwaHandoffClaimRequestSchema,
    PairingPwaHandoffTicketRequestSchema,
    PairingPwaHandoffTicketResponseSchema,
    PairingReconnectChallengeResponseSchema,
    type PairingReconnectResponse,
    PairingReconnectResponseSchema,
    type PairingVerifyCodeResponse,
    PairingVerifyCodeResponseSchema,
} from '@viby/protocol'
import {
    readBrowserStorageItem,
    readBrowserStorageItemOrThrow,
    removeBrowserStorageItem,
    writeBrowserStorageItem,
} from '@/lib/browserStorage'
import { DEVICE_PLATFORM_DISPLAY_LABELS, resolveClientPlatform } from '@/lib/clientPlatform'
import { getPairingGuestTokenStorageKey, LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'
import {
    createReconnectDeviceProof,
    loadCachedPairingDeviceIdentity,
    loadPairingDeviceIdentity,
} from '@/remote/remotePairingDevice'
import { requestRemotePairingPersistentStorage } from '@/remote/remotePairingStoragePersistence'
import type { RemotePairingErrorKey } from './remotePairingErrors'

export type PairingRemoteAuth = PairingClaimResponse | PairingReconnectResponse

type PairingHttpContext = 'claim' | 'handoff' | 'reconnect' | 'verifyCode'

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

export function readRemotePairingId(pathname: string, search = ''): string | null {
    const match = /^\/p\/([^/?#]+)$/.exec(pathname)
    if (match?.[1]) {
        return decodeURIComponent(match[1])
    }
    return hasPairingWorkspaceIntent(pathname, search)
        ? readBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing)
        : null
}

export function rememberRemotePairingId(pairingId: string): void {
    writeBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing, pairingId)
}

export function clearRemotePairingId(): void {
    removeBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing)
}

function getHashParam(key: string): string | null {
    return new URLSearchParams(window.location.hash.slice(1)).get(key)
}

function getSearchParam(key: string): string | null {
    return new URLSearchParams(window.location.search).get(key)
}

export function getPairingTicketFromLocation(): string | null {
    return getHashParam('ticket')
}

// Handoff is delivered through the manifest `start_url` query parameter
// because iOS WebKit standalone PWAs strip the URL fragment from the launch
// URL on cold start, leaving any fragment-based handoff invisible to the
// React app. Older PWAs installed during the fragment-based experiment still
// launch with `#handoff=...`, so fragment stays as a back-compat read.
export function getPairingHandoffTicketFromLocation(): string | null {
    return getSearchParam(PAIRING_PWA_HANDOFF_PARAM) ?? getHashParam(PAIRING_PWA_HANDOFF_PARAM)
}

// The URL fragment only ever carries one-time launch secrets (claim ticket or
// PWA handoff); both have no meaning after consumption. We drop the entire
// fragment and strip any handoff query param while preserving unrelated query.
export function scrubPairingLaunchSecretFromUrl(): void {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.delete(PAIRING_PWA_HANDOFF_PARAM)
    const nextSearch = searchParams.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`)
}

export function getPairingTokenKey(pairingId: string): string {
    return getPairingGuestTokenStorageKey(pairingId)
}

function readStoredGuestToken(pairingId: string): string | null {
    return readBrowserStorageItemOrThrow('local', getPairingGuestTokenStorageKey(pairingId))
}

function storeGuestToken(pairingId: string, token: string): void {
    writeBrowserStorageItem('local', getPairingGuestTokenStorageKey(pairingId), token)
}

export function clearStoredGuestToken(pairingId: string): void {
    removeBrowserStorageItem('local', getPairingGuestTokenStorageKey(pairingId))
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
    if (context === 'claim') {
        return status >= 500 || status === 408 ? 'remotePairing.error.fallback' : 'remotePairing.error.regenerateQr'
    }
    return status >= 500 || status === 408 ? 'remotePairing.error.fallback' : 'remotePairing.error.scanAgain'
}

async function readJsonPayload(response: Response): Promise<unknown> {
    try {
        return await response.json()
    } catch {
        return null
    }
}

export async function claimRemotePairing(pairingId: string, ticket: string): Promise<PairingClaimResponse> {
    const identity = await loadPairingDeviceIdentity(pairingId)
    const platform = resolveClientPlatform()
    const response = await postJson(
        'claim',
        `/pairings/${encodeURIComponent(pairingId)}/claim`,
        {
            ticket,
            label: DEVICE_PLATFORM_DISPLAY_LABELS[platform],
            publicKey: identity.publicKey,
            metadata: { platform },
        },
        (payload) => PairingClaimResponseSchema.parse(payload)
    )
    storeGuestToken(pairingId, response.guestToken)
    await requestRemotePairingPersistentStorage()
    return response
}

export async function recoverRemotePairingByDevice(pairingId: string): Promise<PairingClaimResponse | null> {
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
        (payload) => PairingClaimResponseSchema.parse(payload)
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

export async function claimRemotePwaHandoff(pairingId: string, handoffTicket: string): Promise<PairingClaimResponse> {
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
        (payload) => PairingClaimResponseSchema.parse(payload)
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
            clearStoredGuestToken(pairingId)
        }
        throw error
    }
}

export async function verifyRemotePairingCode(
    pairingId: string,
    token: string,
    code: string
): Promise<PairingVerifyCodeResponse> {
    const response = await postJson(
        'verifyCode',
        `/pairings/${encodeURIComponent(pairingId)}/verify-code`,
        { token, code },
        (payload) => PairingVerifyCodeResponseSchema.parse(payload)
    )
    await requestRemotePairingPersistentStorage()
    return response
}

export function getGuestToken(auth: PairingRemoteAuth): string | null {
    return 'guestToken' in auth ? auth.guestToken : readStoredGuestToken(auth.pairing.id)
}
