import { useCallback, useRef } from 'react'
import { getSessionLifecycleState, getSessionResumeToken } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

type UseSessionTargetResolverOptions = {
    api: ApiClient | null
    session: Session | null | undefined
    onReady: (session: Session) => void
    onError: (error: unknown, currentSessionId: string) => void
}

type ResolveSessionTargetOptions = {
    silent?: boolean
}

type SessionTargetResolverError = Error & {
    code: 'resume_unavailable'
}

function createResumeUnavailableError(): SessionTargetResolverError {
    const error = new Error('Resume session ID unavailable') as SessionTargetResolverError
    error.code = 'resume_unavailable'
    return error
}

export function useSessionTargetResolver(
    options: UseSessionTargetResolverOptions
): (resolveOptions?: ResolveSessionTargetOptions) => Promise<void> {
    const { api, session, onReady, onError } = options
    const inFlightResumeRef = useRef<Promise<void> | null>(null)
    const inFlightErrorReportedRef = useRef(false)

    const reportResumeError = useCallback((error: unknown, currentSessionId: string): void => {
        if (inFlightErrorReportedRef.current) {
            return
        }
        inFlightErrorReportedRef.current = true
        onError(error, currentSessionId)
    }, [onError])

    return useCallback(async (resolveOptions?: ResolveSessionTargetOptions) => {
        const currentSessionId = session?.id
        const silent = resolveOptions?.silent === true
        if (!api || !session || !currentSessionId || session.active) {
            return
        }

        if (inFlightResumeRef.current) {
            if (!silent) {
                void inFlightResumeRef.current.catch((error) => {
                    reportResumeError(error, currentSessionId)
                })
            }
            return await inFlightResumeRef.current
        }

        inFlightErrorReportedRef.current = false
        const resumePromise = (async () => {
            let nextSession = session

            if (getSessionLifecycleState(nextSession) === 'archived') {
                nextSession = await api.unarchiveSession(currentSessionId)
                onReady(nextSession)
                if (nextSession.active) {
                    return
                }
            }

            if (!getSessionResumeToken(nextSession.metadata)) {
                throw createResumeUnavailableError()
            }

            const resumedSession = await api.resumeSession(currentSessionId)
            onReady(resumedSession)
        })()
            .catch((error) => {
                if (!silent) {
                    reportResumeError(error, currentSessionId)
                }
                throw error
            })
            .finally(() => {
                inFlightResumeRef.current = null
                inFlightErrorReportedRef.current = false
            })

        inFlightResumeRef.current = resumePromise
        return await resumePromise
    }, [api, onReady, reportResumeError, session])
}
