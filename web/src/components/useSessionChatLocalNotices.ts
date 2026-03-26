import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionLifecycleState } from '@/types/api'
import type { SessionChatLocalNotice } from '@/components/SessionChatLocalNoticeStack'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import { useNoticeCenter } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

type UseSessionChatLocalNoticesOptions = {
    sessionId: string
    lifecycleState: SessionLifecycleState
    messagesWarning: MessageWindowWarningKey | null
    onUnarchiveSession: () => Promise<void>
}

type UseSessionChatLocalNoticesResult = {
    localNotices: readonly SessionChatLocalNotice[]
}

function buildArchivedNotice(options: {
    noticeIdPrefix: string
    restoring: boolean
    onRestore: () => void
    t: (key: string) => string
}): SessionChatLocalNotice {
    const { noticeIdPrefix, restoring, onRestore, t } = options

    return {
        id: `${noticeIdPrefix}:archived`,
        tone: 'warning',
        title: t('chat.archived.banner'),
        action: {
            label: t('session.action.unarchive'),
            pendingLabel: t('dialog.unarchive.confirming'),
            onPress: onRestore,
            pending: restoring
        }
    }
}

function buildMessageWarningNotice(
    noticeIdPrefix: string,
    title: string
): SessionChatLocalNotice {
    return {
        id: `${noticeIdPrefix}:message-window-warning`,
        tone: 'warning',
        title
    }
}

export function useSessionChatLocalNotices(
    options: UseSessionChatLocalNoticesOptions
): UseSessionChatLocalNoticesResult {
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const {
        sessionId,
        lifecycleState,
        messagesWarning,
        onUnarchiveSession
    } = options
    const [isRestoringArchived, setIsRestoringArchived] = useState(false)
    const isMountedRef = useRef(true)
    const errorPreset = useMemo(() => getNoticePreset('genericError', t), [t])
    const noticeIdPrefix = `chat:${sessionId}`
    const messageWarningTitle = useMemo(() => {
        return messagesWarning ? t(messagesWarning) : null
    }, [messagesWarning, t])

    useEffect(() => {
        return () => {
            isMountedRef.current = false
        }
    }, [])

    const handleRestoreArchivedSession = useCallback(() => {
        if (isRestoringArchived) {
            return
        }

        setIsRestoringArchived(true)
        void onUnarchiveSession()
            .catch((error) => {
                console.error('Failed to unarchive session from chat detail:', error)
                addToast({
                    title: errorPreset.title,
                    description: formatUserFacingErrorMessage(error, {
                        t,
                        fallbackKey: 'chat.resumeFailed.generic'
                    }),
                    tone: errorPreset.tone
                })
            })
            .finally(() => {
                if (isMountedRef.current) {
                    setIsRestoringArchived(false)
                }
            })
    }, [addToast, errorPreset.title, errorPreset.tone, isRestoringArchived, onUnarchiveSession, t])

    const localNotices = useMemo<readonly SessionChatLocalNotice[]>(() => {
        const notices: SessionChatLocalNotice[] = []

        if (lifecycleState === 'archived') {
            notices.push(buildArchivedNotice({
                noticeIdPrefix,
                restoring: isRestoringArchived,
                onRestore: handleRestoreArchivedSession,
                t
            }))
        }

        if (messageWarningTitle) {
            notices.push(buildMessageWarningNotice(noticeIdPrefix, messageWarningTitle))
        }

        return notices
    }, [
        handleRestoreArchivedSession,
        isRestoringArchived,
        lifecycleState,
        messageWarningTitle,
        noticeIdPrefix,
        t
    ])

    return { localNotices }
}
