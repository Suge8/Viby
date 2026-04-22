import { buildPairingClaimUrl, buildPairingWsUrl } from '@viby/protocol/pairing'
import { generatePairingId, generatePairingSecret, hashPairingSecret, tokenHint } from './crypto'
import {
    type PairingCreateRequest,
    type PairingHttpOptions,
    type PairingParticipantRecord,
    type PairingSessionRecord,
    PairingSessionRecordSchema,
} from './httpTypes'
import { buildIceServers } from './turn'

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

export function createIceServers(
    options: Pick<PairingHttpOptions, 'stunUrls' | 'turnGenerator'>,
    pairingId: string,
    now: number
) {
    const turn = options.turnGenerator ? options.turnGenerator.create(pairingId, { now }) : null
    return buildIceServers({ stunUrls: options.stunUrls, turn })
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

export function createPairingSessionRecord(
    input: PairingCreateRequest,
    options: Pick<PairingHttpOptions, 'sessionTtlSeconds' | 'ticketTtlSeconds'> & { now: number }
): {
    session: PairingSessionRecord
    hostToken: string
    ticket: string
} {
    const hostToken = generatePairingSecret()
    const ticket = generatePairingSecret()
    const pairingId = generatePairingId()
    const sessionTtlSeconds = input.sessionTtlSeconds ?? options.sessionTtlSeconds
    const ticketTtlSeconds = input.ticketTtlSeconds ?? options.ticketTtlSeconds

    const session = PairingSessionRecordSchema.parse({
        id: pairingId,
        state: 'waiting',
        createdAt: options.now,
        updatedAt: options.now,
        expiresAt: options.now + sessionTtlSeconds * 1000,
        ticketExpiresAt: options.now + ticketTtlSeconds * 1000,
        shortCode: null,
        approvalStatus: null,
        ticketHash: hashPairingSecret(ticket),
        metadata: input.metadata,
        host: createParticipantRecord({
            token: hostToken,
            label: input.label,
            metadata: input.metadata,
        }),
        guest: null,
    })

    return { session, hostToken, ticket }
}

export function buildPairingUrls(
    baseUrl: string,
    pairingId: string,
    ticket: string,
    token: string
): {
    pairingUrl: string
    wsUrl: string
} {
    return {
        pairingUrl: buildPairingClaimUrl(baseUrl, pairingId, ticket),
        wsUrl: buildPairingWsUrl(baseUrl, pairingId, token),
    }
}
