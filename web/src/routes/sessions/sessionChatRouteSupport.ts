import type { QueryClient } from '@tanstack/react-query'
import { resolveSessionDriver } from '@viby/protocol'
import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import { clearComposerDraft } from '@/components/AssistantChat/useComposerDraftPersistence'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
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
                href: buildSessionHref(options.sessionId),
            })
        },
        [addToast, options.sessionId, t]
    )

    const handleAfterServerAccepted = useCallback(
        async (acceptedSend: AcceptedSend) => {
            clearComposerDraft(acceptedSend.sessionId, 'send-accepted')
            await handleAcceptedSend({
                acceptedSend,
                api: options.api,
                queryClient: options.queryClient,
            })
        },
        [options.api, options.queryClient]
    )

    return useSendMessage(options.api, options.sessionId, {
        onBlocked: handleSendBlocked,
        onSendStart: ({ sessionId: sendingSessionId, localId, createdAt, attachmentsCount }) => {
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
        afterServerAccepted: handleAfterServerAccepted,
        onSendError: ({ sessionId: failedSessionId, error }) => {
            addToast({
                title: t('chat.resumeFailed.title'),
                description: formatSessionRecoveryErrorMessage(error, t),
                tone: 'danger',
                href: buildSessionHref(failedSessionId),
            })
        },
    })
}

export function useSessionAutocompleteSuggestions(
    options: SessionAutocompleteSuggestionsOptions
): SessionAutocompleteSuggestionsModel {
    const sessionDriver = resolveSessionDriver(options.session.metadata)
    const autocompleteRefreshKey = useCommandCapabilityRefreshKey({
        queryClient: options.queryClient,
        sessionId: options.sessionId,
    })

    return useMemo(
        () => ({
            autocompleteRefreshKey,
            getSuggestions: createSessionAutocompleteSuggestions({
                driver: sessionDriver,
                api: options.api,
                queryClient: options.queryClient,
                sessionId: options.sessionId,
            }),
        }),
        [autocompleteRefreshKey, options.api, options.queryClient, options.sessionId, sessionDriver]
    )
}

export function useRefreshSelectedSession(options: RefreshSelectedSessionOptions): () => Promise<void> {
    return useCallback(async () => {
        await reconcileSessionView({
            queryClient: options.queryClient,
            api: options.api,
            selectedSessionId: options.sessionId,
        })
    }, [options.api, options.queryClient, options.sessionId])
}
