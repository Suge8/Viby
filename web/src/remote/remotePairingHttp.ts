import {
    hasPairingWorkspaceIntent,
    type PairingClaimResponse,
    PairingClaimResponseSchema,
    PairingReconnectChallengeResponseSchema,
    type PairingReconnectResponse,
    PairingReconnectResponseSchema,
    type PairingVerifyCodeResponse,
    PairingVerifyCodeResponseSchema,
} from '@viby/protocol'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { getPairingGuestTokenStorageKey, LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'
import { createReconnectDeviceProof, loadPairingDeviceIdentity } from '@/remote/remotePairingDevice'
import { requestRemotePairingPersistentStorage } from '@/remote/remotePairingStoragePersistence'
import type { RemotePairingErrorKey } from './remotePairingErrors'

export type PairingRemoteAuth = PairingClaimResponse | PairingReconnectResponse

type PairingHttpContext = 'claim' | 'reconnect' | 'verifyCode'

export class RemotePairingHttpError extends Error {
    constructor(
        readonly status: number,
        readonly code: RemotePairingErrorKey
    ) {
        super(code)
        this.name = 'RemotePairingHttpError'
    }
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

export function getPairingTicketFromLocation(): string | null {
    return new URLSearchParams(window.location.hash.slice(1)).get('ticket')
}

export function scrubPairingTicketFromUrl(): void {
    const { pathname, search } = window.location
    window.history.replaceState({}, '', `${pathname}${search}`)
}

export function getPairingTokenKey(pairingId: string): string {
    return getPairingGuestTokenStorageKey(pairingId)
}

function readStoredGuestToken(pairingId: string): string | null {
    return readBrowserStorageItem('local', getPairingGuestTokenStorageKey(pairingId))
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
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
    const payload = await readJsonPayload(response)
    if (!response.ok) {
        throw new RemotePairingHttpError(response.status, resolvePairingHttpErrorKey(context, response.status, payload))
    }
    return parse(payload)
}

function readPayloadField(payload: unknown, field: 'code' | 'error' | 'message'): string | null {
    if (!payload || typeof payload !== 'object') return null
    const value = (payload as Record<string, unknown>)[field]
    return typeof value === 'string' ? value : null
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
    const response = await postJson(
        'claim',
        `/pairings/${encodeURIComponent(pairingId)}/claim`,
        { ticket, label: 'Phone', publicKey: identity.publicKey },
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
        if (error instanceof RemotePairingHttpError && (error.status === 403 || error.status === 410)) {
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
