import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiClient } from '@/api/client'
import type { AuthResponse } from '@/types/api'

export type AuthSource = { type: 'accessToken'; token: string }

const SESSION_TOKEN_PREFIX = 'viby_session_token::'

function decodeJwtExpMs(token: string): number | null {
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
        if (typeof payload.exp !== 'number') {
            return null
        }
        return payload.exp * 1000
    } catch {
        return null
    }
}

function getSessionTokenKey(baseUrl: string): string {
    return `${SESSION_TOKEN_PREFIX}${baseUrl}`
}

function readStoredSessionToken(key: string): string | null {
    try {
        const token = localStorage.getItem(key)
        if (!token) {
            return null
        }
        const expMs = decodeJwtExpMs(token)
        if (expMs && expMs > Date.now()) {
            return token
        }
        localStorage.removeItem(key)
        return null
    } catch {
        return null
    }
}

function writeStoredSessionToken(key: string, token: string | null): void {
    try {
        if (token) {
            localStorage.setItem(key, token)
            return
        }
        localStorage.removeItem(key)
    } catch {
        // Ignore storage failures
    }
}

export function useAuth(authSource: AuthSource | null, baseUrl: string): {
    token: string | null
    user: AuthResponse['user'] | null
    api: ApiClient | null
    isLoading: boolean
    error: string | null
} {
    const [token, setToken] = useState<string | null>(() => readStoredSessionToken(getSessionTokenKey(baseUrl)))
    const [user, setUser] = useState<AuthResponse['user'] | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const sessionTokenKey = useMemo(() => getSessionTokenKey(baseUrl), [baseUrl])
    const refreshPromiseRef = useRef<Promise<string | null> | null>(null)
    const tokenRef = useRef<string | null>(readStoredSessionToken(getSessionTokenKey(baseUrl)))
    const lastRefreshAttemptRef = useRef(0)
    const authSourceRef = useRef<AuthSource | null>(authSource)

    authSourceRef.current = authSource
    tokenRef.current = token

    useEffect(() => {
        const storedToken = readStoredSessionToken(sessionTokenKey)
        tokenRef.current = storedToken
        refreshPromiseRef.current = null
        lastRefreshAttemptRef.current = 0
        setToken(storedToken)
        setUser(null)
        setError(null)
        setIsLoading(false)
    }, [sessionTokenKey])

    useEffect(() => {
        writeStoredSessionToken(sessionTokenKey, token)
    }, [sessionTokenKey, token])

    const authenticate = useCallback(async (source: AuthSource, options?: {
        force?: boolean
        minTtlMs?: number
    }): Promise<string | null> => {
        const currentToken = tokenRef.current
        const expMs = currentToken ? decodeJwtExpMs(currentToken) : null
        const minTtlMs = options?.minTtlMs ?? 0
        const now = Date.now()
        const ttlMs = expMs ? expMs - now : null
        const shouldReuseToken = !options?.force && ttlMs !== null && ttlMs > minTtlMs

        if (shouldReuseToken) {
            return currentToken
        }

        if (!options?.force && ttlMs !== null && ttlMs <= minTtlMs && now - lastRefreshAttemptRef.current < 15_000) {
            return currentToken
        }

        if (refreshPromiseRef.current) {
            return await refreshPromiseRef.current
        }

        const run = async () => {
            lastRefreshAttemptRef.current = now

            try {
                const client = new ApiClient('', { baseUrl })
                const auth = await client.authenticate({ accessToken: source.token })
                tokenRef.current = auth.token
                setToken(auth.token)
                setUser(auth.user)
                setError(null)
                return auth.token
            } catch (failure) {
                const isExpired = expMs ? Date.now() >= expMs : false
                if (options?.force || isExpired || !currentToken) {
                    tokenRef.current = null
                    setToken(null)
                    setUser(null)
                    setError(failure instanceof Error ? failure.message : 'Session expired. Please login again.')
                }
                return null
            }
        }

        const refreshPromise = run()
        refreshPromiseRef.current = refreshPromise

        try {
            return await refreshPromise
        } finally {
            if (refreshPromiseRef.current === refreshPromise) {
                refreshPromiseRef.current = null
            }
        }
    }, [baseUrl])

    const api = useMemo(() => (
        token
            ? new ApiClient(token, {
                baseUrl,
                getToken: () => tokenRef.current,
                onUnauthorized: async () => {
                    const currentSource = authSourceRef.current
                    if (!currentSource) {
                        return null
                    }
                    return await authenticate(currentSource, { force: true })
                }
            })
            : null
    ), [authenticate, baseUrl, token])

    useEffect(() => {
        let isCancelled = false

        async function run(): Promise<void> {
            if (!authSource) {
                tokenRef.current = null
                setToken(null)
                setUser(null)
                setError(null)
                setIsLoading(false)
                return
            }

            setIsLoading(tokenRef.current === null)
            try {
                const nextToken = await authenticate(authSource, { minTtlMs: 60_000 })
                if (isCancelled || !nextToken) {
                    return
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false)
                }
            }
        }

        void run()

        return () => {
            isCancelled = true
        }
    }, [authenticate, authSource])

    useEffect(() => {
        if (!token || !authSource) {
            return
        }

        const expMs = decodeJwtExpMs(token)
        if (!expMs) {
            return
        }

        let cancelled = false
        let timeout: ReturnType<typeof setTimeout> | null = null

        const schedule = (delayMs: number) => {
            if (timeout) {
                clearTimeout(timeout)
            }
            timeout = setTimeout(() => {
                void refresh()
            }, Math.max(0, delayMs))
        }

        const refresh = async () => {
            if (cancelled) {
                return
            }
            const currentSource = authSourceRef.current
            if (!currentSource) {
                return
            }
            const refreshed = await authenticate(currentSource, { force: true })
            if (!cancelled && !refreshed && Date.now() < expMs) {
                schedule(15_000)
            }
        }

        schedule(expMs - 60_000 - Date.now())

        return () => {
            cancelled = true
            if (timeout) {
                clearTimeout(timeout)
            }
        }
    }, [authenticate, authSource, token])

    useEffect(() => {
        if (!authSource) {
            return
        }

        const handleActive = () => {
            void authenticate(authSourceRef.current ?? authSource, { minTtlMs: 60_000 })
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                handleActive()
            }
        }

        window.addEventListener('focus', handleActive)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.removeEventListener('focus', handleActive)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [authenticate, authSource])

    return { token, user, api, isLoading, error }
}
