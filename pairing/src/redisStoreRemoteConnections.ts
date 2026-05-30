import type { PairingSessionRecord } from '@viby/protocol/pairing'
import {
    clearSessionSideKeys,
    loadRemoteConnectionIndex,
    saveRemoteConnectionIndex,
    setTokenIndex,
    updateRemoteConnectionIndex,
} from './redisStoreIndexSupport'
import { loadStoredSessionEntry, replaceStoredSession } from './redisStoreSessionSupport'
import {
    cloneSession,
    encodeTokenIndex,
    expireIfNeeded,
    remoteConnectionIndexKey,
    sessionKey,
    tokenIndexKey,
} from './storeSupport'
import type { PairingRemoteConnectionDraft, PairingRemoteConnectionRecord, RedisPairingAdapter } from './storeTypes'

const SESSION_CONNECTION_UPDATE_RETRY_LIMIT = 5

const SAVE_SESSION_CONNECTION_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[5])
redis.call('HSET', KEYS[2], ARGV[3], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[5])
redis.call('SET', KEYS[3], ARGV[6], 'EX', ARGV[5])
return 1
`.trim()

export function createRemoteConnection(
    pairingId: string,
    deviceId: string,
    connection: PairingRemoteConnectionDraft,
    at: number
): PairingRemoteConnectionRecord {
    return {
        id: connection.connectionId,
        connectionId: connection.connectionId,
        pairingId,
        deviceId,
        tokenHash: connection.participant.tokenHash,
        channel: 'tunnel',
        createdAt: at,
        lastSeenAt: at,
    }
}

export async function updateSessionWithRemoteConnection(options: {
    adapter: RedisPairingAdapter
    now: () => number
    pairingId: string
    ttlSeconds(expiresAt: number): number
    mutate(session: PairingSessionRecord): Promise<{
        connection: PairingRemoteConnectionRecord
        session: PairingSessionRecord
    } | null>
}): Promise<PairingSessionRecord | null> {
    for (let attempt = 0; attempt < SESSION_CONNECTION_UPDATE_RETRY_LIMIT; attempt += 1) {
        const entry = await loadStoredSessionEntry(options.adapter, options.pairingId)
        if (!entry) return null

        const current = expireIfNeeded(entry.session, options.now(), new Map())
        if (current !== entry.session) {
            if (current.state === 'expired') await clearSessionSideKeys(options.adapter, entry.session)
            await replaceStoredSession({
                adapter: options.adapter,
                pairingId: options.pairingId,
                expectedRaw: entry.raw,
                next: current,
                ttlSeconds: options.ttlSeconds(current.expiresAt),
            })
            return null
        }

        const next = await options.mutate(current)
        if (!next) return null
        const saved = await saveSessionWithRemoteConnection({
            adapter: options.adapter,
            expectedRaw: entry.raw,
            session: next.session,
            connection: next.connection,
            ttlSeconds: options.ttlSeconds(next.session.expiresAt),
        })
        if (saved) return cloneSession(next.session)
    }
    return null
}

export async function saveGuestRemoteConnectionToken(options: {
    adapter: RedisPairingAdapter
    connection: PairingRemoteConnectionRecord
    ttlSeconds: number
}): Promise<void> {
    await saveRemoteConnectionIndex(options)
    await setTokenIndex({
        adapter: options.adapter,
        connectionId: options.connection.id,
        tokenHash: options.connection.tokenHash,
        pairingId: options.connection.pairingId,
        role: 'guest',
        ttlSeconds: options.ttlSeconds,
    })
}

export async function loadGuestRemoteConnections(
    adapter: RedisPairingAdapter,
    pairingId: string
): Promise<PairingRemoteConnectionRecord[]> {
    return await loadRemoteConnectionIndex(adapter, pairingId)
}

export async function markGuestRemoteConnectionForSession(options: {
    adapter: RedisPairingAdapter
    at: number
    connected: boolean
    connectionId: string
    getExpiresAt: (pairingId: string) => Promise<number | null>
    pairingId: string
    ttlSeconds: (expiresAt: number) => number
}): Promise<void> {
    const expiresAt = await options.getExpiresAt(options.pairingId)
    if (expiresAt === null) return
    await updateRemoteConnectionIndex({
        adapter: options.adapter,
        pairingId: options.pairingId,
        ttlSeconds: options.ttlSeconds(expiresAt),
        where: (connection) => connection.id === options.connectionId,
        update: (connection) => ({
            ...connection,
            connectedAt: options.connected ? options.at : undefined,
            lastSeenAt: options.at,
        }),
    })
}

async function saveSessionWithRemoteConnection(options: {
    adapter: RedisPairingAdapter
    connection: PairingRemoteConnectionRecord
    expectedRaw: string
    session: PairingSessionRecord
    ttlSeconds: number
}): Promise<boolean> {
    const evalRedisScript = options.adapter.eval?.bind(options.adapter)
    if (!evalRedisScript) throw new Error('redis eval command unavailable')
    const result = await evalRedisScript<number>(
        SAVE_SESSION_CONNECTION_SCRIPT,
        [
            sessionKey(options.session.id),
            remoteConnectionIndexKey(options.session.id),
            tokenIndexKey(options.connection.tokenHash),
        ],
        [
            options.expectedRaw,
            JSON.stringify(options.session),
            options.connection.id,
            JSON.stringify(options.connection),
            String(options.ttlSeconds),
            encodeTokenIndex({
                connectionId: options.connection.connectionId,
                pairingId: options.session.id,
                role: 'guest',
            }),
        ]
    )
    return result === 1
}
