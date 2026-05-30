import type { PairingRole, PairingSessionRecord } from '@viby/protocol/pairing'
import {
    cloneHandoffTicket,
    cloneReconnectChallenge,
    decodeHandoffTicket,
    decodeHandoffTicketIndex,
    decodeReconnectChallenge,
    decodeStringIndex,
    decodeTokenIndex,
    encodeHandoffTicket,
    encodeHandoffTicketIndex,
    encodeReconnectChallenge,
    encodeStringIndex,
    encodeTokenIndex,
    guestConnectionTokenIndexKey,
    handoffTicketIndexKey,
    handoffTicketKey,
    type PairingTokenIndex,
    reconnectChallengeKey,
    remoteConnectionIndexKey,
    tokenIndexKey,
} from './storeSupport'
import type {
    PairingHandoffTicketRecord,
    PairingReconnectChallengeRecord,
    PairingRemoteConnectionRecord,
    RedisPairingAdapter,
} from './storeTypes'

const RECONNECT_CHALLENGE_ROLES: readonly PairingRole[] = ['host', 'guest']

export async function createTokenIndex(options: {
    adapter: RedisPairingAdapter
    connectionId?: string
    tokenHash: string
    pairingId: string
    role: PairingRole
    ttlSeconds: number
}): Promise<boolean> {
    return await options.adapter.compareAndSet(
        tokenIndexKey(options.tokenHash),
        null,
        encodeTokenIndex({ connectionId: options.connectionId, pairingId: options.pairingId, role: options.role }),
        { ttlSeconds: options.ttlSeconds }
    )
}

export async function setTokenIndex(options: {
    adapter: RedisPairingAdapter
    connectionId?: string
    tokenHash: string
    pairingId: string
    role: PairingRole
    ttlSeconds: number
}): Promise<void> {
    await options.adapter.set(
        tokenIndexKey(options.tokenHash),
        encodeTokenIndex({ connectionId: options.connectionId, pairingId: options.pairingId, role: options.role }),
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
}

export async function saveRemoteConnectionIndex(options: {
    adapter: RedisPairingAdapter
    connection: PairingRemoteConnectionRecord
    ttlSeconds: number
}): Promise<void> {
    const indexKey = remoteConnectionIndexKey(options.connection.pairingId)
    await requireRedisHash(options.adapter).hset(indexKey, options.connection.id, JSON.stringify(options.connection))
    await requireRedisHash(options.adapter).expire(indexKey, options.ttlSeconds)
}

export async function loadRemoteConnectionIndex(
    adapter: RedisPairingAdapter,
    pairingId: string
): Promise<PairingRemoteConnectionRecord[]> {
    return Object.values(await requireRedisHash(adapter).hgetall(remoteConnectionIndexKey(pairingId)))
        .map(decodeRemoteConnectionRecord)
        .filter((connection): connection is PairingRemoteConnectionRecord => connection !== null)
}

export async function updateRemoteConnectionIndex(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    ttlSeconds: number
    update: (connection: PairingRemoteConnectionRecord) => PairingRemoteConnectionRecord
    where: (connection: PairingRemoteConnectionRecord) => boolean
}): Promise<void> {
    const indexKey = remoteConnectionIndexKey(options.pairingId)
    for (const connection of await loadRemoteConnectionIndex(options.adapter, options.pairingId)) {
        if (!options.where(connection)) continue
        await requireRedisHash(options.adapter).hset(
            indexKey,
            connection.id,
            JSON.stringify(options.update(connection))
        )
    }
    await requireRedisHash(options.adapter).expire(indexKey, options.ttlSeconds)
}

export async function clearGuestConnectionTokenIndexes(adapter: RedisPairingAdapter, pairingId: string): Promise<void> {
    for (const connection of await loadRemoteConnectionIndex(adapter, pairingId)) {
        await adapter.del(tokenIndexKey(connection.tokenHash))
    }
    const legacyTokenHashes = decodeStringIndex((await adapter.get(guestConnectionTokenIndexKey(pairingId))) ?? '[]')
    for (const tokenHash of legacyTokenHashes) await adapter.del(tokenIndexKey(tokenHash))
    await adapter.del(remoteConnectionIndexKey(pairingId))
    await adapter.del(guestConnectionTokenIndexKey(pairingId))
}

function requireRedisHash(
    adapter: RedisPairingAdapter
): Required<Pick<RedisPairingAdapter, 'expire' | 'hgetall' | 'hset'>> {
    if (!adapter.expire || !adapter.hgetall || !adapter.hset) throw new Error('redis hash commands unavailable')
    return {
        expire: adapter.expire.bind(adapter),
        hgetall: adapter.hgetall.bind(adapter),
        hset: adapter.hset.bind(adapter),
    }
}

function decodeRemoteConnectionRecord(raw: string): PairingRemoteConnectionRecord | null {
    try {
        const parsed = JSON.parse(raw) as unknown
        return isRemoteConnectionRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function isRemoteConnectionRecord(value: unknown): value is PairingRemoteConnectionRecord {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Partial<PairingRemoteConnectionRecord>
    return (
        typeof record.id === 'string' &&
        typeof record.pairingId === 'string' &&
        typeof record.tokenHash === 'string' &&
        typeof record.createdAt === 'number' &&
        typeof record.lastSeenAt === 'number'
    )
}

export async function clearSessionSideKeys(adapter: RedisPairingAdapter, session: PairingSessionRecord): Promise<void> {
    await clearTokenIndexes(adapter, session)
    await clearGuestConnectionTokenIndexes(adapter, session.id)
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
