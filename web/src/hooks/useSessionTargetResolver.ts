import { useCallback, useEffect, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

type UseSessionTargetResolverOptions = {
    api: ApiClient | null
    session: Session | null | undefined
    onResolved: (currentSessionId: string, resolvedSessionId: string) => void
    onError: (error: unknown, currentSessionId: string) => void
}

type ResolvedTarget = {
    sourceId: string
    targetId: string
}

export function useSessionTargetResolver(
    options: UseSessionTargetResolverOptions
): (currentSessionId: string) => Promise<string> {
    const { api, session, onResolved, onError } = options
    const resolvedTargetRef = useRef<ResolvedTarget | null>(null)
    const inFlightResumeRef = useRef<Promise<string> | null>(null)

    useEffect(() => {
        const sessionId = session?.id
        if (!sessionId) {
            resolvedTargetRef.current = null
            inFlightResumeRef.current = null
            return
        }

        const resolvedTarget = resolvedTargetRef.current
        if (!resolvedTarget) {
            return
        }

        if (sessionId === resolvedTarget.targetId || sessionId !== resolvedTarget.sourceId) {
            resolvedTargetRef.current = null
            inFlightResumeRef.current = null
        }
    }, [session?.active, session?.id])

    return useCallback(async (currentSessionId: string) => {
        if (!api || !session || session.active) {
            return currentSessionId
        }

        const resolvedTarget = resolvedTargetRef.current
        if (resolvedTarget && resolvedTarget.sourceId === currentSessionId) {
            return resolvedTarget.targetId
        }

        if (inFlightResumeRef.current) {
            return await inFlightResumeRef.current
        }

        const resumePromise = api.resumeSession(currentSessionId)
            .then((resolvedSessionId) => {
                resolvedTargetRef.current = {
                    sourceId: currentSessionId,
                    targetId: resolvedSessionId
                }
                onResolved(currentSessionId, resolvedSessionId)
                return resolvedSessionId
            })
            .catch((error) => {
                onError(error, currentSessionId)
                throw error
            })
            .finally(() => {
                inFlightResumeRef.current = null
            })

        inFlightResumeRef.current = resumePromise
        return await resumePromise
    }, [api, onError, onResolved, session])
}
