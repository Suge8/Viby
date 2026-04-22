import { reportWebRuntimeWarning } from '@/lib/runtimeDiagnostics'
import type { BrowserStorageKeyByKind } from '@/lib/storage/storageRegistry'

export type BrowserStorageKind = 'local' | 'session'

export type BrowserStorageWriteResult =
    | {
          ok: true
      }
    | {
          ok: false
          reason: 'unavailable' | 'quota' | 'error'
          errorName?: string
      }

type ReadBrowserStorageJsonOptions<T> = {
    storage: BrowserStorageKind
    key: BrowserStorageKeyByKind[BrowserStorageKind]
    parse: (rawValue: string) => T | null
    removeInvalid?: boolean
}

function accessBrowserStorage<T>(
    storage: BrowserStorageKind,
    operation: (storageHost: Storage) => T,
    fallbackValue: T
): T {
    const storageHost = getBrowserStorage(storage)
    if (!storageHost) {
        return fallbackValue
    }

    try {
        return operation(storageHost)
    } catch {
        return fallbackValue
    }
}

export function getBrowserStorage(storage: BrowserStorageKind): Storage | null {
    if (typeof window === 'undefined') {
        return null
    }

    try {
        return storage === 'local' ? window.localStorage : window.sessionStorage
    } catch {
        return null
    }
}

export function removeBrowserStorageItem<K extends BrowserStorageKind>(
    storage: K,
    key: BrowserStorageKeyByKind[K]
): void {
    accessBrowserStorage(
        storage,
        (storageHost) => {
            storageHost.removeItem(key)
        },
        undefined
    )
}

export function readBrowserStorageItem<K extends BrowserStorageKind>(
    storage: K,
    key: BrowserStorageKeyByKind[K]
): string | null {
    return accessBrowserStorage(
        storage,
        (storageHost) => {
            return storageHost.getItem(key)
        },
        null
    )
}

export function writeBrowserStorageItem<K extends BrowserStorageKind>(
    storage: K,
    key: BrowserStorageKeyByKind[K],
    value: string
): BrowserStorageWriteResult {
    const storageHost = getBrowserStorage(storage)
    if (!storageHost) {
        return {
            ok: false,
            reason: 'unavailable',
        }
    }

    try {
        storageHost.setItem(key, value)
        return {
            ok: true,
        }
    } catch (error) {
        const errorName =
            error instanceof DOMException || error instanceof Error ? error.name : typeof error === 'object' ? '' : ''
        const reason = errorName === 'QuotaExceededError' ? 'quota' : 'error'
        reportWebRuntimeWarning('browser storage write failed', {
            storage,
            key,
            reason,
            errorName: errorName || undefined,
        })
        return {
            ok: false,
            reason,
            errorName: errorName || undefined,
        }
    }
}

export function readBrowserStorageJson<T>(options: ReadBrowserStorageJsonOptions<T>): T | null {
    const { storage, key, parse, removeInvalid = true } = options
    const rawValue = readBrowserStorageItem(storage, key)
    if (!rawValue) {
        return null
    }

    const parsedValue = parse(rawValue)
    if (parsedValue !== null) {
        return parsedValue
    }

    if (removeInvalid) {
        removeBrowserStorageItem(storage, key)
    }

    return null
}

export function writeBrowserStorageJson<K extends BrowserStorageKind>(
    storage: K,
    key: BrowserStorageKeyByKind[K],
    value: unknown
): BrowserStorageWriteResult {
    return writeBrowserStorageItem(storage, key, JSON.stringify(value))
}
