import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { resetComposerDraftPersistenceForTests } from '@/components/AssistantChat/composerDraftStore'
import { resetMessageWindowWarmSnapshotForTests } from '@/lib/messageWindowWarmSnapshot'
import { resetSessionAttentionStoreForTests } from '@/lib/sessionAttentionStore'
import { resetSessionsWarmSnapshotForTests } from '@/lib/sessionsWarmSnapshot'
import { resetSessionWarmSnapshotForTests } from '@/lib/sessionWarmSnapshot'
import { resetAppCacheDbForTests } from '@/lib/storage/appCacheDb'

type StorageLike = Pick<Storage, 'clear' | 'getItem' | 'key' | 'removeItem' | 'setItem'> & {
    readonly length: number
}

function createMemoryStorage(): StorageLike {
    const data = new Map<string, string>()

    return {
        get length() {
            return data.size
        },
        clear() {
            data.clear()
        },
        getItem(key: string) {
            return data.has(key) ? data.get(key)! : null
        },
        key(index: number) {
            return Array.from(data.keys())[index] ?? null
        },
        removeItem(key: string) {
            data.delete(key)
        },
        setItem(key: string, value: string) {
            data.set(String(key), String(value))
        },
    }
}

function ensureStorage(): void {
    const storage = createMemoryStorage()

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: storage,
    })
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        writable: true,
        value: storage,
    })
}

ensureStorage()

if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string): MediaQueryList => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false,
        }),
    })
}

Object.defineProperty(globalThis, '__VIBY_TEST_APP_CACHE_DB_SUFFIX__', {
    configurable: true,
    writable: true,
    value: `worker-${Math.random().toString(36).slice(2)}`,
})

afterEach(async () => {
    cleanup()
    vi.useRealTimers()
    window.localStorage.clear()
    window.sessionStorage.clear()
    await resetComposerDraftPersistenceForTests()
    await resetMessageWindowWarmSnapshotForTests()
    await resetSessionAttentionStoreForTests()
    await resetSessionWarmSnapshotForTests()
    await resetSessionsWarmSnapshotForTests()
    await resetAppCacheDbForTests()
})
