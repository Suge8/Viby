import type { QueryClient } from '@tanstack/react-query'
import { resolveSessionDriver } from '@viby/protocol'
import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import { clearComposerDraft } from '@/components/AssistantChat/useComposerDraftPersistence'
import { type SendErrorInfo, type SendStartInfo, useSendMessage } from '@/hooks/mutations/useSendMessage'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useNoticeCenter } from '@/lib/notice-center'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { formatSessionRecoveryErrorMessage } from '@/lib/sessionRecoveryError'
import { reconcileSessionView } from '@/lib/sessionViewReconciler'
import { useTranslation } from '@/lib/use-translation'
import { type AcceptedSend, handleAcceptedSend } from '@/routes/sessions/postSwitchSendRecovery'
import { useCommandCapabilityRefreshKey } from '@/routes/sessions/SessionAutocompleteCapabilities'
import { createSessionAutocompleteSuggestions } from '@/routes/sessions/sessionAutocomplete'
import { buildSessionHref } from '@/routes/sessions/sessionRoutePaths'
import type { Session } from '@/types/api'

type SessionSendActionsOptions = {
    api: ApiClient
    queryClient: QueryClient
    sessionId: string
    shouldQueueSend: () => boolean
}

type SessionAutocompleteSuggestionsOptions = {
    api: ApiClient
    queryClient: QueryClient
    session: Session
    sessionId: string
}

type RefreshSelectedSessionOptions = {
    api: ApiClient
    queryClient: QueryClient
    sessionId: string
}

type SessionAutocompleteSuggestionsModel = {
    autocompleteRefreshKey: number
    getSuggestions: (query: string) => Promise<Suggestion[]>
}

export function useSessionChatSendActions(options: SessionSendActionsOptions): ReturnType<typeof useSendMessage> {
    const { api, shouldQueueSend, queryClient, sessionId } = options
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()

    const handleSendBlocked = useCallback(
        (reason: 'no-api' | 'no-session' | 'pending') => {
            if (reason !== 'no-api') {
                return
            }

            addToast({
                title: t('send.blocked.title'),
                description: t('send.blocked.noConnection'),
                tone: 'warning',
                href: buildSessionHref(sessionId),
            })
        },
        [addToast, sessionId, t]
    )

    const handleSendStart = useCallback(
        ({ sessionId: sendingSessionId, localId, createdAt, attachmentsCount }: SendStartInfo) => {
            appendRealtimeTrace({
                at: Date.now(),
                type: 'message_send_start',
                details: {
                    sessionId: sendingSessionId,
                    localId,
                    createdAt,
                    attachmentsCount,
                },
            })
        },
        []
    )

    const handleAfterServerAccepted = useCallback(
        async (acceptedSend: AcceptedSend) => {
            clearComposerDraft(acceptedSend.sessionId, 'send-accepted')
            await handleAcceptedSend({
                acceptedSend,
                api,
                queryClient,
            })
        },
        [api, queryClient]
    )

    const handleSendError = useCallback(
        ({ sessionId: failedSessionId, error }: SendErrorInfo) => {
            addToast({
                title: t('chat.resumeFailed.title'),
                description: formatSessionRecoveryErrorMessage(error, t),
                tone: 'danger',
                href: buildSessionHref(failedSessionId),
            })
        },
        [addToast, t]
    )

    return useSendMessage(api, sessionId, {
        shouldQueueSend,
        onBlocked: handleSendBlocked,
        onSendStart: handleSendStart,
        afterServerAccepted: handleAfterServerAccepted,
        onSendError: handleSendError,
    })
}

export function useSessionAutocompleteSuggestions(
    options: SessionAutocompleteSuggestionsOptions
): SessionAutocompleteSuggestionsModel {
    const { api, queryClient, session, sessionId } = options
    const sessionDriver = resolveSessionDriver(session.metadata)
    const autocompleteRefreshKey = useCommandCapabilityRefreshKey({
        queryClient,
        sessionId,
    })

    return useMemo(
        () => ({
            autocompleteRefreshKey,
            getSuggestions: createSessionAutocompleteSuggestions({
                driver: sessionDriver,
                api,
                queryClient,
                sessionId,
            }),
        }),
        [api, autocompleteRefreshKey, queryClient, sessionDriver, sessionId]
    )
}

export function useRefreshSelectedSession(options: RefreshSelectedSessionOptions): () => Promise<void> {
    const { api, queryClient, sessionId } = options
    return useCallback(async () => {
        await reconcileSessionView({
            queryClient,
            api,
            selectedSessionId: sessionId,
        })
    }, [api, queryClient, sessionId])
}
