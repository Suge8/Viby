import { isSessionHistoryLifecycleState, resolveSessionInteractivity } from '@viby/protocol'
import { useCallback, useMemo, useRef } from 'react'
import { useChatViewportLayout } from '@/components/AssistantChat/useChatViewportLayout'
import type { SessionChatLocalNotice } from '@/components/SessionChatLocalNoticeStack'
import { buildSessionChatLayoutStyle, type SessionChatLayoutStyle } from '@/components/sessionChatLayoutStyle'
import type {
    SessionChatComposerSurfaceModel,
    SessionChatRuntimeSurfaceModel,
    SessionChatWorkspaceProps,
} from '@/components/sessionChatWorkspaceTypes'
import { useElementFrame } from '@/hooks/useElementFrame'
import { useTranslation } from '@/lib/use-translation'
import type { AttachmentMetadata } from '@/types/api'

function buildHistoryNotice(options: { noticeIdPrefix: string; t: (key: string) => string }): SessionChatLocalNotice {
    const { noticeIdPrefix, t } = options
    return {
        id: `${noticeIdPrefix}:history`,
        tone: 'warning',
        title: t('chat.history.banner'),
    }
}

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
    chatLayoutStyle: SessionChatLayoutStyle
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
    const { isStandalone, isKeyboardOpen, bottomInsetPx, floatingControlBottomInsetPx, visibleViewportBottomPx } =
        useChatViewportLayout()
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
        if (isSessionHistoryLifecycleState(lifecycleState) && resumeAvailable) {
            notices.push(
                buildHistoryNotice({
                    noticeIdPrefix,
                    t,
                })
            )
        } else if (isSessionHistoryLifecycleState(lifecycleState)) {
            notices.push(buildInactiveLegacyNotice(noticeIdPrefix, t('chat.inactive.readonlyLegacy')))
        }

        if (messageWarningTitle) {
            notices.push(buildMessageWarningNotice(noticeIdPrefix, messageWarningTitle))
        }

        return notices
    }, [lifecycleState, messageWarningTitle, noticeIdPrefix, resumeAvailable, t])

    const chatLayoutStyle = useMemo<SessionChatLayoutStyle>(() => {
        return buildSessionChatLayoutStyle({
            composerFrame,
            composerHeight,
            bottomInsetPx,
            floatingControlBottomInsetPx,
        })
    }, [bottomInsetPx, composerFrame, composerHeight, floatingControlBottomInsetPx])

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
            pendingReply: messageState.pendingReply,
            onSwitchSessionDriver: actions.onSwitchSessionDriver,
            isSwitchingSessionDriver: actions.isSwitchingSessionDriver,
            allowSendWhenInactive,
            attachmentsSupported: true,
            disabled: messageState.isSending,
        }),
        [
            actions.isSwitchingSessionDriver,
            actions.onSwitchSessionDriver,
            allowSendWhenInactive,
            messageState.isSending,
            messageState.pendingReply,
            props.api,
            runtimeOptions,
            session,
            visibleViewportBottomPx,
        ]
    )

    return {
        chatLayoutStyle,
        composerRef,
        composerSurfaceModel,
        isKeyboardOpen,
        isStandalone,
        localNotices,
        persistComposerDraft,
        runtimeSurfaceModel,
    }
}
