import { isSessionHistoryLifecycleState, resolveSessionInteractivity } from '@viby/protocol'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useChatViewportLayout } from '@/components/AssistantChat/useChatViewportLayout'
import type { SessionChatLocalNotice } from '@/components/SessionChatLocalNoticeStack'
import { buildSessionChatLayoutCssVars } from '@/components/sessionChatLayoutStyle'
import type {
    SessionChatComposerSurfaceModel,
    SessionChatRuntimeSurfaceModel,
    SessionChatWorkspaceProps,
} from '@/components/sessionChatWorkspaceTypes'
import { useElementFrame } from '@/hooks/useElementFrame'
import { useTranslation } from '@/lib/use-translation'
import type { AttachmentMetadata } from '@/types/api'

function buildInactiveLegacyNotice(noticeIdPrefix: string, title: string): SessionChatLocalNotice {
    return {
        id: `${noticeIdPrefix}:inactive-readonly`,
        tone: 'warning',
        title,
    }
}

function buildMessageWarningNotice(noticeIdPrefix: string, title: string): SessionChatLocalNotice {
    return {
        id: `${noticeIdPrefix}:message-window-warning`,
        tone: 'warning',
        title,
    }
}

export function useSessionChatWorkspaceModel(props: SessionChatWorkspaceProps): {
    composerRef: React.RefObject<HTMLDivElement | null>
    composerSurfaceModel: SessionChatComposerSurfaceModel
    isKeyboardOpen: boolean
    isStandalone: boolean
    localNotices: readonly SessionChatLocalNotice[]
    persistComposerDraft: boolean
    runtimeSurfaceModel: SessionChatRuntimeSurfaceModel
} {
    const { t } = useTranslation()
    const { session, actions, messageState, runtimeOptions, persistComposerDraft = true } = props
    const { lifecycleState, resumeAvailable, allowSendWhenInactive } = resolveSessionInteractivity(session)
    const { isStandalone, isKeyboardOpen, bottomInsetPx, visibleViewportBottomPx } = useChatViewportLayout()
    const composerRef = useRef<HTMLDivElement | null>(null)
    const composerFrame = useElementFrame(composerRef)
    const composerAnchorTop = Math.round(composerFrame?.top ?? 0)
    const composerHeight = composerFrame?.height ?? 0
    const noticeIdPrefix = `chat:${session.id}`
    const messageWarningTitle = useMemo(() => {
        return messageState.warning ? t(messageState.warning) : null
    }, [messageState.warning, t])

    const handleSend = useCallback(
        (text: string, attachments?: AttachmentMetadata[]) => {
            actions.onSend(text, attachments)
        },
        [actions.onSend]
    )

    const localNotices = useMemo<readonly SessionChatLocalNotice[]>(() => {
        const notices: SessionChatLocalNotice[] = []
        if (isSessionHistoryLifecycleState(lifecycleState) && !resumeAvailable) {
            notices.push(buildInactiveLegacyNotice(noticeIdPrefix, t('chat.inactive.readonlyLegacy')))
        }

        if (messageWarningTitle) {
            notices.push(buildMessageWarningNotice(noticeIdPrefix, messageWarningTitle))
        }

        return notices
    }, [lifecycleState, messageWarningTitle, noticeIdPrefix, resumeAvailable, t])

    /* Publish composer geometry on document.documentElement so portal
       overlays (RemotePairingLinkBadge) and in-tree controls share one
       source of truth. `buildSessionChatLayoutCssVars` always returns
       the full schema, so the same `vars` object drives both write and
       cleanup — unmount releases every key back to the :root defaults. */
    useEffect(() => {
        const root = document.documentElement
        const vars = buildSessionChatLayoutCssVars({ composerFrame, composerHeight, bottomInsetPx })
        for (const [name, value] of Object.entries(vars)) {
            root.style.setProperty(name, value)
        }
        return () => {
            for (const name of Object.keys(vars)) {
                root.style.removeProperty(name)
            }
        }
    }, [bottomInsetPx, composerFrame, composerHeight])

    const runtimeSurfaceModel = useMemo<SessionChatRuntimeSurfaceModel>(
        () => ({
            api: props.api,
            session,
            composerAnchorTop,
            composerHeight,
            messageState,
            onAbort: actions.onAbort,
            onAtBottomChange: actions.onAtBottomChange,
            onFlushPending: actions.onFlushPending,
            onLoadHistoryUntilPreviousUser: actions.onLoadHistoryUntilPreviousUser,
            onRefresh: actions.onRefresh,
            onRetryMessage: actions.onRetryMessage,
            onSend: handleSend,
            allowSendWhenInactive,
        }),
        [
            actions.onAbort,
            actions.onAtBottomChange,
            actions.onFlushPending,
            actions.onLoadHistoryUntilPreviousUser,
            actions.onRefresh,
            actions.onRetryMessage,
            allowSendWhenInactive,
            composerAnchorTop,
            composerHeight,
            handleSend,
            messageState,
            props.api,
            session,
        ]
    )

    const composerSurfaceModel = useMemo<SessionChatComposerSurfaceModel>(
        () => ({
            api: props.api,
            session,
            runtimeOptions: {
                ...runtimeOptions,
                autocompleteLayout: {
                    visibleViewportBottomPx,
                },
            },
            isSending: messageState.isSending,
            sendPending: messageState.isSending,
            onSwitchSessionDriver: actions.onSwitchSessionDriver,
            isSwitchingSessionDriver: actions.isSwitchingSessionDriver,
            allowSendWhenInactive,
            attachmentsSupported: true,
            disabled: false,
        }),
        [
            actions.isSwitchingSessionDriver,
            actions.onSwitchSessionDriver,
            allowSendWhenInactive,
            messageState.isSending,
            props.api,
            runtimeOptions,
            session,
            visibleViewportBottomPx,
        ]
    )

    return {
        composerRef,
        composerSurfaceModel,
        isKeyboardOpen,
        isStandalone,
        localNotices,
        persistComposerDraft,
        runtimeSurfaceModel,
    }
}
