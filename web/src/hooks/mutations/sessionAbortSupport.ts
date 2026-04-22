import type { QueryClient } from '@tanstack/react-query'
import { getSessionReplyingState, type SessionReplyingState, setSessionReplyingState } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import { patchSessionInQueryCache } from '@/lib/sessionQueryCache'
import type { SessionResponse, SessionsResponse } from '@/types/api'

export type AbortSessionMutationContext = {
    previousSession?: SessionResponse
    previousSessions?: SessionsResponse
    previousReplyingState?: SessionReplyingState | null
}

export function captureAbortSessionMutationContext(options: {
    queryClient: QueryClient
    sessionId: string
}): AbortSessionMutationContext {
    const previousSession = options.queryClient.getQueryData<SessionResponse>(queryKeys.session(options.sessionId))
    const previousSessions = options.queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
    const previousReplyingState = getSessionReplyingState(options.sessionId)

    patchSessionInQueryCache(options.queryClient, options.sessionId, (session) => {
        return {
            ...session,
            thinking: false,
            thinkingAt: Date.now(),
        }
    })

    setSessionReplyingState(options.sessionId, null)

    return {
        previousSession,
        previousSessions,
        previousReplyingState,
    }
}

export function restoreAbortSessionMutationContext(options: {
    queryClient: Pick<QueryClient, 'setQueryData'>
    sessionId: string
    context: AbortSessionMutationContext | undefined
}): void {
    if (!options.context) {
        return
    }

    if (options.context.previousSession) {
        options.queryClient.setQueryData(queryKeys.session(options.sessionId), options.context.previousSession)
    }
    if (options.context.previousSessions) {
        options.queryClient.setQueryData(queryKeys.sessions, options.context.previousSessions)
    }
    if (options.context.previousReplyingState !== undefined) {
        setSessionReplyingState(options.sessionId, options.context.previousReplyingState)
    }
}
