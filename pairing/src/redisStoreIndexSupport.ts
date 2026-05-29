import type { PairingRole, PairingSessionRecord } from '@viby/protocol/pairing'
import {
    cloneHandoffTicket,
    cloneReconnectChallenge,
    decodeHandoffTicket,
    decodeHandoffTicketIndex,
    decodeReconnectChallenge,
    decodeTokenIndex,
    encodeHandoffTicket,
    encodeHandoffTicketIndex,
    encodeReconnectChallenge,
    encodeTokenIndex,
    handoffTicketIndexKey,
    handoffTicketKey,
    type PairingTokenIndex,
    reconnectChallengeKey,
    tokenIndexKey,
} from './storeSupport'
import type { PairingHandoffTicketRecord, PairingReconnectChallengeRecord, RedisPairingAdapter } from './storeTypes'

const RECONNECT_CHALLENGE_ROLES: readonly PairingRole[] = ['host', 'guest']

export async function createTokenIndex(options: {
    adapter: RedisPairingAdapter
    tokenHash: string
    pairingId: string
    role: PairingRole
    ttlSeconds: number
}): Promise<boolean> {
    return await options.adapter.compareAndSet(
        tokenIndexKey(options.tokenHash),
        null,
        encodeTokenIndex({ pairingId: options.pairingId, role: options.role }),
        { ttlSeconds: options.ttlSeconds }
    )
}

export async function setTokenIndex(options: {
    adapter: RedisPairingAdapter
    tokenHash: string
    pairingId: string
    role: PairingRole
    ttlSeconds: number
}): Promise<void> {
    await options.adapter.set(
        tokenIndexKey(options.tokenHash),
        encodeTokenIndex({ pairingId: options.pairingId, role: options.role }),
        {
            ttlSeconds: options.ttlSeconds,
        }
    )
}

export async function loadTokenIndex(
    adapter: RedisPairingAdapter,
    tokenHash: string
): Promise<PairingTokenIndex | null> {
    const rawIndex = await adapter.get(tokenIndexKey(tokenHash))
    if (!rawIndex) {
        return null
    }

    const index = decodeTokenIndex(rawIndex)
    if (!index) {
        await adapter.del(tokenIndexKey(tokenHash))
        return null
    }
    return index
}

export async function clearTokenIndexes(adapter: RedisPairingAdapter, session: PairingSessionRecord): Promise<void> {
    await adapter.del(tokenIndexKey(session.host.tokenHash))
    if (session.guest) {
        await adapter.del(tokenIndexKey(session.guest.tokenHash))
    }
}

export async function clearSessionSideKeys(adapter: RedisPairingAdapter, session: PairingSessionRecord): Promise<void> {
    await clearTokenIndexes(adapter, session)
    await clearReconnectChallenges(adapter, session.id)
    await clearHandoffTicket(adapter, session.id)
}

export async function storeReconnectChallenge(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    role: PairingRole
    challenge: PairingReconnectChallengeRecord
    ttlSeconds: number
}): Promise<PairingReconnectChallengeRecord> {
    await options.adapter.set(
        reconnectChallengeKey(options.pairingId, options.role),
        encodeReconnectChallenge(options.challenge),
        { ttlSeconds: options.ttlSeconds }
    )
    return cloneReconnectChallenge(options.challenge)
}

export async function consumeReconnectChallenge(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    role: PairingRole
    nonce: string
    at: number
}): Promise<boolean> {
    const key = reconnectChallengeKey(options.pairingId, options.role)
    const raw = await options.adapter.get(key)
    if (!raw) {
        return false
    }

    const challenge = decodeReconnectChallenge(raw)
    if (!challenge || challenge.nonce !== options.nonce || options.at > challenge.expiresAt) {
        await options.adapter.del(key)
        return false
    }

    return await options.adapter.compareAndSet(key, raw, null)
}

export async function storeHandoffTicket(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    ticket: PairingHandoffTicketRecord
    ttlSeconds: number
}): Promise<PairingHandoffTicketRecord> {
    await options.adapter.set(
        handoffTicketKey(options.pairingId, options.ticket.tokenHash),
        encodeHandoffTicket(options.ticket),
        { ttlSeconds: options.ttlSeconds }
    )
    await appendHandoffTicketIndex(options)
    return cloneHandoffTicket(options.ticket)
}

export async function consumeHandoffTicket(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    tokenHash: string
    at: number
}): Promise<boolean> {
    const key = handoffTicketKey(options.pairingId, options.tokenHash)
    const raw = await options.adapter.get(key)
    if (raw) return await consumeStoredHandoffTicket(options, key, raw)

    const legacyKey = handoffTicketKey(options.pairingId)
    const legacyRaw = await options.adapter.get(legacyKey)
    return legacyRaw ? await consumeStoredHandoffTicket(options, legacyKey, legacyRaw) : false
}

async function consumeStoredHandoffTicket(
    options: { adapter: RedisPairingAdapter; at: number; tokenHash: string },
    key: string,
    raw: string
): Promise<boolean> {
    const ticket = decodeHandoffTicket(raw)
    if (!ticket || ticket.tokenHash !== options.tokenHash || options.at > ticket.expiresAt) {
        await options.adapter.del(key)
        return false
    }
    return await options.adapter.compareAndSet(key, raw, null)
}

async function appendHandoffTicketIndex(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    ticket: PairingHandoffTicketRecord
    ttlSeconds: number
}): Promise<void> {
    const key = handoffTicketIndexKey(options.pairingId)
    const current = decodeHandoffTicketIndex((await options.adapter.get(key)) ?? '[]')
    await options.adapter.set(key, encodeHandoffTicketIndex([...current, options.ticket.tokenHash]), {
        ttlSeconds: options.ttlSeconds,
    })
}

export async function clearHandoffTicket(adapter: RedisPairingAdapter, pairingId: string): Promise<void> {
    const indexKey = handoffTicketIndexKey(pairingId)
    const tokenHashes = decodeHandoffTicketIndex((await adapter.get(indexKey)) ?? '[]')
    await Promise.all([
        adapter.del(handoffTicketKey(pairingId)),
        adapter.del(indexKey),
        ...tokenHashes.map((tokenHash) => adapter.del(handoffTicketKey(pairingId, tokenHash))),
    ])
}

export async function clearReconnectChallenges(adapter: RedisPairingAdapter, pairingId: string): Promise<void> {
    for (const role of RECONNECT_CHALLENGE_ROLES) {
        await adapter.del(reconnectChallengeKey(pairingId, role))
    }
}
