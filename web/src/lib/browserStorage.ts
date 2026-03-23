export type BrowserStorageKind = 'local' | 'session'

type ReadBrowserStorageJsonOptions<T> = {
    storage: BrowserStorageKind
    key: string
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

export function removeBrowserStorageItem(storage: BrowserStorageKind, key: string): void {
    accessBrowserStorage(storage, (storageHost) => {
        storageHost.removeItem(key)
    }, undefined)
}

export function readBrowserStorageItem(storage: BrowserStorageKind, key: string): string | null {
    return accessBrowserStorage(storage, (storageHost) => {
        return storageHost.getItem(key)
    }, null)
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

export function writeBrowserStorageJson(storage: BrowserStorageKind, key: string, value: unknown): void {
    accessBrowserStorage(storage, (storageHost) => {
        storageHost.setItem(key, JSON.stringify(value))
    }, undefined)
}
