import {
    buildPairingEventsUrl,
    buildPairingInviteUrl,
    buildPairingTunnelUrl,
    buildPairingWsUrl,
} from '@viby/protocol/pairing'
import {
    generatePairingId,
    generatePairingSecret,
    generatePairingShortCode,
    hashPairingSecret,
    tokenHint,
} from './crypto'
import {
    type PairingCreateRequest,
    type PairingHttpOptions,
    type PairingParticipantRecord,
    type PairingSessionRecord,
    PairingSessionRecordSchema,
} from './httpTypes'
import { buildIceServers } from './iceServers'
import type { PairingRemoteConnectionDraft } from './storeTypes'

export function getBearerToken(value: string | null | undefined): string | null {
    if (!value) {
        return null
    }

    const trimmed = value.trim()
    return trimmed.startsWith('Bearer ') ? trimmed.slice('Bearer '.length).trim() : null
}

export function getNow(now?: () => number): number {
    return now?.() ?? Date.now()
}

export function createParticipantRecord(input: {
    token: string
    label?: string
    publicKey?: string
    metadata?: Record<string, unknown>
}): PairingParticipantRecord {
    return {
        tokenHash: hashPairingSecret(input.token),
        tokenHint: tokenHint(input.token),
        label: input.label,
        publicKey: input.publicKey,
        metadata: input.metadata,
    }
}

export function createRemoteConnectionDraft(input: {
    token: string
    label?: string
    publicKey?: string
    metadata?: Record<string, unknown>
}): PairingRemoteConnectionDraft {
    return {
        connectionId: generatePairingSecret(18),
        participant: createParticipantRecord(input),
    }
}

export function createIceServers(options: Pick<PairingHttpOptions, 'stunUrls'>) {
    return buildIceServers({ stunUrls: options.stunUrls })
}

export function authorizeCreateRequest(
    options: Pick<PairingHttpOptions, 'createToken'>,
    authHeader: string | null | undefined
): Response | null {
    if (!options.createToken) {
        return null
    }

    const token = getBearerToken(authHeader)
    if (!token || token !== options.createToken) {
        return Response.json({ error: 'Unauthorized pairing creation request' }, { status: 401 })
    }

    return null
}

/**
 * Generate a fresh pairing session record. The 6-digit `shortCode` is the
 * sole auth credential the host displays; it is created up-front so the host
 * can render it immediately on the create response without polling. There is
 * no separate QR ticket. Devices that open the invite URL and submit the
 * matching code become the approved guest in a single atomic step.
 */
export function createPairingSessionRecord(
    input: PairingCreateRequest,
    options: Pick<PairingHttpOptions, 'sessionTtlSeconds'> & { now: number }
): {
    session: PairingSessionRecord
    hostToken: string
} {
    const hostToken = generatePairingSecret()
    const pairingId = generatePairingId()
    const sessionTtlSeconds = input.sessionTtlSeconds ?? options.sessionTtlSeconds

    const session = PairingSessionRecordSchema.parse({
        id: pairingId,
        state: 'waiting',
        createdAt: options.now,
        updatedAt: options.now,
        expiresAt: options.now + sessionTtlSeconds * 1000,
        shortCode: generatePairingShortCode(),
        approvalStatus: null,
        metadata: input.metadata,
        host: createParticipantRecord({
            token: hostToken,
            label: input.label,
            metadata: input.metadata,
        }),
        authorizedDevice: null,
    })

    return { session, hostToken }
}

export function buildPairingUrls(
    baseUrl: string,
    pairingId: string,
    token: string
): {
    pairingUrl: string
    tunnelUrl: string
    wsUrl: string
    eventsUrl: string
} {
    return {
        pairingUrl: buildPairingInviteUrl(baseUrl, pairingId),
        tunnelUrl: buildPairingTunnelUrl(baseUrl, pairingId, token),
        wsUrl: buildPairingWsUrl(baseUrl, pairingId, token),
        eventsUrl: buildPairingEventsUrl(baseUrl, pairingId, token),
    }
}
