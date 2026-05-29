import { useCallback, useMemo, useState } from 'react'
import { readBrowserStorageItem, removeBrowserStorageItem } from '@/lib/browserStorage'
import { type BrowserLocalStorageKey, getAccessTokenStorageKey } from '@/lib/storage/storageRegistry'
import { clearStoredDeviceBinding, readStoredDeviceBinding } from './deviceBindingStorage'
import type { AuthSource } from './useAuth'

function removeTokenFromUrlParams(): void {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('token')) return
    url.searchParams.delete('token')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function readStoredAccessToken(key: BrowserLocalStorageKey): string | null {
    return readBrowserStorageItem('local', key)
}

function clearStoredAccessToken(key: BrowserLocalStorageKey): void {
    removeBrowserStorageItem('local', key)
}

function resolveAuthSource(accessTokenKey: BrowserLocalStorageKey): AuthSource | null {
    removeTokenFromUrlParams()
    const storedDevice = readStoredDeviceBinding(accessTokenKey)
    if (storedDevice) return { type: 'device', ...storedDevice }

    const storedToken = readStoredAccessToken(accessTokenKey)
    return storedToken ? { type: 'accessToken', token: storedToken } : null
}

type AuthSourceState = {
    accessTokenKey: BrowserLocalStorageKey
    authSource: AuthSource | null
}

function createAuthSourceState(accessTokenKey: BrowserLocalStorageKey): AuthSourceState {
    return {
        accessTokenKey,
        authSource: resolveAuthSource(accessTokenKey),
    }
}

export function useAuthSource(baseUrl: string): {
    authSource: AuthSource | null
    refreshAuthSource: () => void
    clearAuth: () => void
} {
    const accessTokenKey = useMemo(() => getAccessTokenStorageKey(baseUrl), [baseUrl])
    const [state, setState] = useState<AuthSourceState>(() => createAuthSourceState(accessTokenKey))
    const authSource = state.accessTokenKey === accessTokenKey ? state.authSource : resolveAuthSource(accessTokenKey)

    const refreshAuthSource = useCallback(() => {
        setState({
            accessTokenKey,
            authSource: resolveAuthSource(accessTokenKey),
        })
    }, [accessTokenKey])

    const clearAuth = useCallback(() => {
        clearStoredAccessToken(accessTokenKey)
        clearStoredDeviceBinding(accessTokenKey)
        setState({
            accessTokenKey,
            authSource: null,
        })
    }, [accessTokenKey])

    return {
        authSource,
        refreshAuthSource,
        clearAuth,
    }
}
