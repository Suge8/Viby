import { useCallback, useMemo, useState } from 'react'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { type BrowserLocalStorageKey, getAccessTokenStorageKey } from '@/lib/storage/storageRegistry'
import type { AuthSource } from './useAuth'

function getTokenFromUrlParams(): string | null {
    if (typeof window === 'undefined') {
        return null
    }
    const query = new URLSearchParams(window.location.search)
    return query.get('token')
}

function readStoredAccessToken(key: BrowserLocalStorageKey): string | null {
    return readBrowserStorageItem('local', key)
}

function writeStoredAccessToken(key: BrowserLocalStorageKey, token: string): void {
    writeBrowserStorageItem('local', key, token)
}

function clearStoredAccessToken(key: BrowserLocalStorageKey): void {
    removeBrowserStorageItem('local', key)
}

function resolveAuthSource(accessTokenKey: BrowserLocalStorageKey): AuthSource | null {
    const urlToken = getTokenFromUrlParams()
    if (urlToken) {
        writeStoredAccessToken(accessTokenKey, urlToken)
        return { type: 'accessToken', token: urlToken }
    }

    const storedToken = readStoredAccessToken(accessTokenKey)
    if (storedToken) {
        return { type: 'accessToken', token: storedToken }
    }

    return null
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
    setAccessToken: (token: string) => void
    clearAuth: () => void
} {
    const accessTokenKey = useMemo(() => getAccessTokenStorageKey(baseUrl), [baseUrl])
    const [state, setState] = useState<AuthSourceState>(() => createAuthSourceState(accessTokenKey))
    const authSource = state.accessTokenKey === accessTokenKey ? state.authSource : resolveAuthSource(accessTokenKey)

    const setAccessToken = useCallback(
        (token: string) => {
            writeStoredAccessToken(accessTokenKey, token)
            setState({
                accessTokenKey,
                authSource: { type: 'accessToken', token },
            })
        },
        [accessTokenKey]
    )

    const clearAuth = useCallback(() => {
        clearStoredAccessToken(accessTokenKey)
        setState({
            accessTokenKey,
            authSource: null,
        })
    }, [accessTokenKey])

    return {
        authSource,
        setAccessToken,
        clearAuth,
    }
}
