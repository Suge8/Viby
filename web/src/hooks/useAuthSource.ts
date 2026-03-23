import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthSource } from './useAuth'

const ACCESS_TOKEN_PREFIX = 'viby_access_token::'

function getTokenFromUrlParams(): string | null {
    if (typeof window === 'undefined') {
        return null
    }
    const query = new URLSearchParams(window.location.search)
    return query.get('token')
}

function getAccessTokenKey(baseUrl: string): string {
    return `${ACCESS_TOKEN_PREFIX}${baseUrl}`
}

function readStoredAccessToken(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeStoredAccessToken(key: string, token: string): void {
    try {
        localStorage.setItem(key, token)
    } catch {
        // Ignore storage errors
    }
}

function clearStoredAccessToken(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function resolveAuthSource(accessTokenKey: string): AuthSource | null {
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

export function useAuthSource(baseUrl: string): {
    authSource: AuthSource | null
    setAccessToken: (token: string) => void
    clearAuth: () => void
} {
    const accessTokenKey = useMemo(() => getAccessTokenKey(baseUrl), [baseUrl])
    const [authSource, setAuthSource] = useState<AuthSource | null>(() => resolveAuthSource(accessTokenKey))

    useEffect(() => {
        setAuthSource(resolveAuthSource(accessTokenKey))
    }, [accessTokenKey])

    const setAccessToken = useCallback((token: string) => {
        writeStoredAccessToken(accessTokenKey, token)
        setAuthSource({ type: 'accessToken', token })
    }, [accessTokenKey])

    const clearAuth = useCallback(() => {
        clearStoredAccessToken(accessTokenKey)
        setAuthSource(null)
    }, [accessTokenKey])

    return {
        authSource,
        setAccessToken,
        clearAuth
    }
}
