import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { reportWebRuntimeWarning } from '@/lib/runtimeDiagnostics'
import type { DecryptedMessage, Session, SessionSummary } from '@/types/api'
import {
    APP_CACHE_BROADCAST_CHANNEL,
    APP_CACHE_DB_NAME,
    APP_CACHE_DB_VERSION,
    APP_CACHE_STORES,
    type AppCacheStoreName,
} from './storageRegistry'

export type ComposerDraftCacheRecord = Readonly<{
    updatedAt: number
    value: string
}>

export type MessageWindowWarmCacheRecord = Readonly<{
    at: number
    snapshot: Readonly<{
        atBottom: boolean
        hasLoadedLatest: boolean
        hasMore: boolean
        historyExpanded: boolean
        messages: DecryptedMessage[]
        sessionId: string
    }>
}>

export type SessionWarmCacheRecord = Readonly<{
    at: number
    fingerprint: string
    session: Session
}>

export type SessionsWarmCacheRecord = Readonly<{
    at: number
    fingerprint: string
    sessions: SessionSummary[]
}>

export type SessionAttentionCacheRecord = Readonly<{
    snapshot: Record<string, number>
}>

export type AppCacheBroadcastEvent = Readonly<{
    type: 'session-attention-updated'
}>

type AppCacheRecordByStore = {
    [APP_CACHE_STORES.composerDrafts]: ComposerDraftCacheRecord
    [APP_CACHE_STORES.messageWindowWarm]: MessageWindowWarmCacheRecord
    [APP_CACHE_STORES.sessionAttention]: SessionAttentionCacheRecord
    [APP_CACHE_STORES.sessionWarm]: SessionWarmCacheRecord
    [APP_CACHE_STORES.sessionsWarm]: SessionsWarmCacheRecord
}

type AppCacheDbSchema = DBSchema & {
    [StoreName in AppCacheStoreName]: {
        key: string
        value: AppCacheRecordByStore[StoreName]
    }
}

const APP_CACHE_STORE_LIST = Object.values(APP_CACHE_STORES) as AppCacheStoreName[]
const TEST_APP_CACHE_DB_SUFFIX_KEY = '__VIBY_TEST_APP_CACHE_DB_SUFFIX__'

let appCacheDbPromise: Promise<IDBPDatabase<AppCacheDbSchema> | null> | null = null

function resolveAppCacheDbName(): string {
    const globalRecord = globalThis as Record<string, unknown>
    const suffix = globalRecord[TEST_APP_CACHE_DB_SUFFIX_KEY]
    return typeof suffix === 'string' && suffix.length > 0 ? `${APP_CACHE_DB_NAME}-${suffix}` : APP_CACHE_DB_NAME
}

function createBroadcastChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') {
        return null
    }

    try {
        return new window.BroadcastChannel(APP_CACHE_BROADCAST_CHANNEL)
    } catch {
        return null
    }
}

export function publishAppCacheBroadcast(event: AppCacheBroadcastEvent): void {
    const channel = createBroadcastChannel()
    if (!channel) {
        return
    }

    channel.postMessage(event)
    channel.close()
}

export function subscribeAppCacheBroadcast(handler: (event: AppCacheBroadcastEvent) => void): () => void {
    const channel = createBroadcastChannel()
    if (!channel) {
        return () => undefined
    }

    channel.onmessage = (event: MessageEvent<AppCacheBroadcastEvent>) => {
        if (!event.data || typeof event.data !== 'object') {
            return
        }

        handler(event.data)
    }

    return () => {
        channel.close()
    }
}

export function getAppCacheDb(): Promise<IDBPDatabase<AppCacheDbSchema> | null> {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
        return Promise.resolve(null)
    }

    appCacheDbPromise ??= openDB<AppCacheDbSchema>(resolveAppCacheDbName(), APP_CACHE_DB_VERSION, {
        upgrade(db) {
            for (const storeName of APP_CACHE_STORE_LIST) {
                if (db.objectStoreNames.contains(storeName)) {
                    continue
                }

                db.createObjectStore(storeName)
            }
        },
        blocked() {
            reportWebRuntimeWarning('app cache db upgrade blocked', {
                dbName: resolveAppCacheDbName(),
                version: APP_CACHE_DB_VERSION,
            })
        },
        blocking() {
            reportWebRuntimeWarning('app cache db version change requires reload', {
                dbName: resolveAppCacheDbName(),
                version: APP_CACHE_DB_VERSION,
            })
        },
        terminated() {
            appCacheDbPromise = null
        },
    }).catch((error) => {
        reportWebRuntimeWarning('app cache db unavailable', {
            dbName: resolveAppCacheDbName(),
            message: error instanceof Error ? error.message : String(error),
        })
        appCacheDbPromise = null
        return null
    })

    return appCacheDbPromise
}

export async function readAppCacheRecord<StoreName extends AppCacheStoreName>(
    storeName: StoreName,
    key: string
): Promise<AppCacheRecordByStore[StoreName] | null> {
    const db = await getAppCacheDb()
    if (!db) {
        return null
    }

    try {
        const value = (await db.get(storeName, key)) as AppCacheRecordByStore[StoreName] | undefined
        return value ?? null
    } catch {
        return null
    }
}

export async function writeAppCacheRecord<StoreName extends AppCacheStoreName>(
    storeName: StoreName,
    key: string,
    value: AppCacheRecordByStore[StoreName]
): Promise<boolean> {
    const db = await getAppCacheDb()
    if (!db) {
        return false
    }

    try {
        await db.put(storeName, value, key)
        return true
    } catch (error) {
        reportWebRuntimeWarning('app cache write failed', {
            dbName: resolveAppCacheDbName(),
            storeName,
            key,
            message: error instanceof Error ? error.message : String(error),
        })
        return false
    }
}

export async function removeAppCacheRecord(storeName: AppCacheStoreName, key: string): Promise<boolean> {
    const db = await getAppCacheDb()
    if (!db) {
        return false
    }

    try {
        await db.delete(storeName, key)
        return true
    } catch (error) {
        reportWebRuntimeWarning('app cache delete failed', {
            dbName: resolveAppCacheDbName(),
            storeName,
            key,
            message: error instanceof Error ? error.message : String(error),
        })
        return false
    }
}

export async function readAllAppCacheRecords<StoreName extends AppCacheStoreName>(
    storeName: StoreName
): Promise<Array<[string, AppCacheRecordByStore[StoreName]]>> {
    const db = await getAppCacheDb()
    if (!db) {
        return []
    }

    try {
        const keys = (await db.getAllKeys(storeName)).map((key) => String(key))
        const values = (await db.getAll(storeName)) as AppCacheRecordByStore[StoreName][]
        return keys.map((key, index) => [key, values[index]!])
    } catch {
        return []
    }
}

export async function resetAppCacheDbForTests(): Promise<void> {
    const db = await appCacheDbPromise
    db?.close()
    appCacheDbPromise = null
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
        return
    }

    await new Promise<void>((resolve) => {
        const request = window.indexedDB.deleteDatabase(resolveAppCacheDbName())
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
    })
}
