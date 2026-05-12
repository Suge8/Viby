import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'
import { clearRetainedReady, getRetainedReady, setRetainedReady } from './RemotePairingPersistence'

const cache = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@/lib/storage/appCacheDb', () => ({
    readAppCacheRecord: vi.fn(async (_store: string, key: string) => cache.get(key) ?? null),
    writeAppCacheRecord: vi.fn(async (_store: string, key: string, value: unknown) => {
        cache.set(key, value)
        return true
    }),
    removeAppCacheRecord: vi.fn(async (_store: string, key: string) => {
        cache.delete(key)
        return true
    }),
}))

describe('RemotePairingPersistence', () => {
    beforeEach(() => cache.clear())

    it('stores only retained ready timestamp by pairing id', async () => {
        await setRetainedReady('pairing-1', 123)
        expect(await getRetainedReady('pairing-1')).toEqual({ lastReadyAt: 123 })
        expect(APP_CACHE_STORES.pairingRetainedReady).toBe('pairing-retained-ready')
    })

    it('clears retained ready by pairing id', async () => {
        await setRetainedReady('pairing-1', 123)
        await clearRetainedReady('pairing-1')
        expect(await getRetainedReady('pairing-1')).toBeNull()
    })
})
