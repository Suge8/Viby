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

type SessionTargetResolverError = Error & {
    code: 'resume_unavailable' | 'session_archived'
}

function getSessionTargetResolverErrorMessage(
    code: SessionTargetResolverError['code']
): string {
    switch (code) {
        case 'session_archived':
            return 'Archived sessions must be restored before resuming'
        case 'resume_unavailable':
            return 'Resume session ID unavailable'
    }
}

function createSessionTargetResolverError(
    code: SessionTargetResolverError['code']
): SessionTargetResolverError {
    const error = new Error(getSessionTargetResolverErrorMessage(code)) as SessionTargetResolverError
    error.code = code
    return error
}

export function useSessionTargetResolver(
    options: UseSessionTargetResolverOptions
): () => Promise<void> {
    const { api, session, onReady, onError } = options
    const inFlightResumeRef = useRef<Promise<void> | null>(null)

    return useCallback(async () => {
        const currentSessionId = session?.id
        if (!api || !session || !currentSessionId || session.active) {
            return
        }

        if (getSessionLifecycleState(session) === 'archived') {
            const error = createSessionTargetResolverError('session_archived')
            onError(error, currentSessionId)
            throw error
        }

        if (!getSessionResumeToken(session.metadata)) {
            const error = createSessionTargetResolverError('resume_unavailable')
            onError(error, currentSessionId)
            throw error
        }

        if (inFlightResumeRef.current) {
            return await inFlightResumeRef.current
        }

        const resumePromise = api.resumeSession(currentSessionId)
            .then((resumedSession) => {
                onReady(resumedSession)
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
    }, [api, onError, onReady, session])
}
