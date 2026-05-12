import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { type BrowserLocalStorageKey } from '@/lib/storage/storageRegistry'

export type StoredDeviceBinding = { deviceId: string; secret: string }

function key(baseKey: BrowserLocalStorageKey): BrowserLocalStorageKey {
    return `${baseKey}:device` as BrowserLocalStorageKey
}

export function readStoredDeviceBinding(baseKey: BrowserLocalStorageKey): StoredDeviceBinding | null {
    const raw = readBrowserStorageItem('local', key(baseKey))
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw) as Partial<StoredDeviceBinding>
        if (typeof parsed.deviceId === 'string' && typeof parsed.secret === 'string')
            return parsed as StoredDeviceBinding
    } catch {}
    return null
}

export function writeStoredDeviceBinding(baseKey: BrowserLocalStorageKey, binding: StoredDeviceBinding): void {
    writeBrowserStorageItem('local', key(baseKey), JSON.stringify(binding))
}

export function clearStoredDeviceBinding(baseKey: BrowserLocalStorageKey): void {
    removeBrowserStorageItem('local', key(baseKey))
}
