import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authenticateWithAccessToken } from '@/api/authClient'
import type { ApiClient } from '@/api/client'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import type { AuthResponse } from '@/types/api'
import {
    decodeJwtExpMs,
    getSessionTokenKey,
    loadApiClientModule,
    readStoredSessionToken,
    readStoredSessionTokenForBaseUrl,
    writeStoredSessionToken,
} from './authSessionToken'

export type AuthSource = { type: 'accessToken'; token: string }

const SESSION_REFRESH_DEBOUNCE_MS = 15_000
const SESSION_REFRESH_RETRY_MS = 15_000
const SESSION_REFRESH_MIN_TTL_MS = 60_000

export function useAuth(
    authSource: AuthSource | null,
    baseUrl: string
): {
    token: string | null
    user: AuthResponse['user'] | null
    api: ApiClient | null
    isLoading: boolean
    error: string | null
} {
    const [token, setToken] = useState<string | null>(() => readStoredSessionTokenForBaseUrl(baseUrl))
    const [user, setUser] = useState<AuthResponse['user'] | null>(null)
    const [api, setApi] = useState<ApiClient | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const sessionTokenKey = useMemo(() => getSessionTokenKey(baseUrl), [baseUrl])
    const refreshPromiseRef = useRef<Promise<string | null> | null>(null)
    const tokenRef = useRef<string | null>(readStoredSessionTokenForBaseUrl(baseUrl))
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
        setApi(null)
        setError(null)
        setIsLoading(false)
    }, [sessionTokenKey])

    useEffect(() => {
        writeStoredSessionToken(sessionTokenKey, token)
    }, [sessionTokenKey, token])

    const authenticate = useCallback(
        async (
            source: AuthSource,
            options?: {
                force?: boolean
                minTtlMs?: number
            }
        ): Promise<string | null> => {
            const currentToken = tokenRef.current
            const expMs = currentToken ? decodeJwtExpMs(currentToken) : null
            const minTtlMs = options?.minTtlMs ?? 0
            const now = Date.now()
            const ttlMs = expMs ? expMs - now : null
            const shouldReuseToken = !options?.force && ttlMs !== null && ttlMs > minTtlMs

            if (shouldReuseToken) {
                return currentToken
            }

            if (
                !options?.force &&
                ttlMs !== null &&
                ttlMs <= minTtlMs &&
                now - lastRefreshAttemptRef.current < SESSION_REFRESH_DEBOUNCE_MS
            ) {
                return currentToken
            }

            if (refreshPromiseRef.current) {
                return await refreshPromiseRef.current
            }

            const run = async () => {
                lastRefreshAttemptRef.current = now

                try {
                    const auth = await authenticateWithAccessToken(baseUrl, source.token)
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
        },
        [baseUrl]
    )

    useEffect(() => {
        let isCancelled = false

        if (!token) {
            setApi(null)
            return
        }

        void (async () => {
            const module = await loadApiClientModule()
            if (isCancelled) {
                return
            }

            setApi(
                new module.ApiClient(token, {
                    baseUrl,
                    getToken: () => tokenRef.current,
                    onUnauthorized: async () => {
                        const currentSource = authSourceRef.current
                        if (!currentSource) {
                            return null
                        }
                        return await authenticate(currentSource, { force: true })
                    },
                })
            )
        })()

        return () => {
            isCancelled = true
        }
    }, [authenticate, baseUrl, token])

    useEffect(() => {
        let isCancelled = false

        async function run(): Promise<void> {
            if (!authSource) {
                if (tokenRef.current) {
                    setError(null)
                    setIsLoading(false)
                    return
                }

                tokenRef.current = null
                setToken(null)
                setUser(null)
                setError(null)
                setIsLoading(false)
                return
            }

            setIsLoading(tokenRef.current === null)
            try {
                const nextToken = await authenticate(authSource, { minTtlMs: SESSION_REFRESH_MIN_TTL_MS })
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
            timeout = setTimeout(
                () => {
                    void refresh()
                },
                Math.max(0, delayMs)
            )
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
                schedule(SESSION_REFRESH_RETRY_MS)
            }
        }

        schedule(expMs - SESSION_REFRESH_MIN_TTL_MS - Date.now())

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
            void authenticate(authSourceRef.current ?? authSource, { minTtlMs: SESSION_REFRESH_MIN_TTL_MS })
        }

        return subscribeForegroundPulse(handleActive)
    }, [authenticate, authSource])

    return { token, user, api, isLoading, error }
}
