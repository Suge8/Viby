import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { type BrowserLocalStorageKey, getSessionTokenStorageKey } from '@/lib/storage/storageRegistry'

export function decodeJwtExpMs(token: string): number | null {
    const parts = token.split('.')
    if (parts.length < 2) {
        return null
    }

    const payloadBase64Url = parts[1] ?? ''
    const payloadBase64 = payloadBase64Url
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(payloadBase64Url.length / 4) * 4, '=')

    try {
        const decoded = globalThis.atob(payloadBase64)
        const payload = JSON.parse(decoded) as { exp?: unknown }
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null
    } catch {
        return null
    }
}

export function getSessionTokenKey(baseUrl: string): BrowserLocalStorageKey {
    return getSessionTokenStorageKey(baseUrl)
}

export function readStoredSessionToken(key: BrowserLocalStorageKey): string | null {
    const token = readBrowserStorageItem('local', key)
    if (!token) {
        return null
    }

    const expMs = decodeJwtExpMs(token)
    if (expMs && expMs > Date.now()) {
        return token
    }
    removeBrowserStorageItem('local', key)
    return null
}

export function readStoredSessionTokenForBaseUrl(baseUrl: string): string | null {
    return readStoredSessionToken(getSessionTokenKey(baseUrl))
}

export function writeStoredSessionToken(key: BrowserLocalStorageKey, token: string | null): void {
    if (token) {
        writeBrowserStorageItem('local', key, token)
        return
    }
    removeBrowserStorageItem('local', key)
}

export async function loadApiClientModule(): Promise<typeof import('@/api/client')> {
    return await import('@/api/client')
}
