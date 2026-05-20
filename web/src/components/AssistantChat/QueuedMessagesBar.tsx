import { useCallback, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { FeatureCloseIcon } from '@/components/featureIcons'
import { TextContent } from '@/components/TextContent'
import { Button } from '@/components/ui/button'
import { removeQueuedMessages } from '@/lib/message-window-store'
import { isQueuedForInvocation } from '@/lib/messages'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import type { DecryptedMessage } from '@/types/api'

const QUEUED_PREVIEW_LIMIT = 3

type QueuedMessagesBarProps = {
    api: ApiClient
    sessionId: string
    messages: readonly DecryptedMessage[]
    pending: readonly DecryptedMessage[]
    disabled?: boolean
}

type QueuedMessageItem = {
    localId: string
    text: string
}

function getQueuedMessageText(message: DecryptedMessage): string {
    const normalized = normalizeDecryptedMessage(message)
    if (!normalized || normalized.role !== 'user') {
        return ''
    }

    const text = normalized.content.text.trim()
    if (text.length > 0) {
        return text
    }

    const attachments = normalized.content.attachments ?? []
    return attachments.map((attachment) => attachment.filename).join(', ')
}

function collectQueuedMessages(
    messages: readonly DecryptedMessage[],
    pending: readonly DecryptedMessage[]
): QueuedMessageItem[] {
    const seenLocalIds = new Set<string>()
    const queued: QueuedMessageItem[] = []
    const collect = (candidates: readonly DecryptedMessage[]) => {
        for (const message of candidates) {
            if (!message.localId || seenLocalIds.has(message.localId) || !isQueuedForInvocation(message)) {
                continue
            }
            seenLocalIds.add(message.localId)
            queued.push({
                localId: message.localId,
                text: getQueuedMessageText(message),
            })
        }
    }
    collect(messages)
    collect(pending)
    return queued
}

function useQueuedMessages(
    messages: readonly DecryptedMessage[],
    pending: readonly DecryptedMessage[]
): QueuedMessageItem[] {
    return useMemo(() => collectQueuedMessages(messages, pending), [messages, pending])
}

export function QueuedMessagesBar({
    api,
    disabled,
    messages,
    pending,
    sessionId,
}: QueuedMessagesBarProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const queuedMessages = useQueuedMessages(messages, pending)
    const cancelingIdsRef = useRef<ReadonlySet<string>>(new Set())
    const [cancelingIds, setCancelingIds] = useState<ReadonlySet<string>>(() => cancelingIdsRef.current)
    const visibleMessages = queuedMessages.slice(0, QUEUED_PREVIEW_LIMIT)
    const overflowCount = queuedMessages.length - visibleMessages.length

    const cancelQueuedMessage = useCallback(
        async (localId: string) => {
            if (disabled || cancelingIdsRef.current.has(localId)) {
                return
            }

            const setCancelingMessage = (canceling: boolean): void => {
                const next = new Set(cancelingIdsRef.current)
                if (canceling) {
                    next.add(localId)
                } else {
                    next.delete(localId)
                }
                cancelingIdsRef.current = next
                setCancelingIds(next)
            }

            setCancelingMessage(true)
            try {
                const canceled = await api.cancelQueuedMessages(sessionId, [localId])
                removeQueuedMessages(sessionId, canceled)
            } finally {
                setCancelingMessage(false)
            }
        },
        [api, disabled, sessionId]
    )

    if (queuedMessages.length === 0) {
        return null
    }

    return (
        <div className="px-2 pb-2">
            <div className="rounded-3xl border border-[color:color-mix(in_srgb,var(--ds-brand)_22%,var(--ds-border-default))] bg-[color:color-mix(in_srgb,var(--ds-brand)_8%,var(--ds-panel-strong))] p-2 shadow-[var(--ds-shadow-soft)]">
                <div className="flex items-center justify-between gap-3 px-2 pb-1">
                    <div className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-brand)]">
                        {t('queuedMessages.title')}
                    </div>
                    <div className="text-xs text-[var(--app-hint)]">
                        {t('queuedMessages.count').replace('{count}', `${queuedMessages.length}`)}
                    </div>
                </div>
                <div className="space-y-1">
                    {visibleMessages.map((message) => {
                        const canceling = cancelingIds.has(message.localId)
                        return (
                            <div
                                className="flex items-center gap-2 rounded-2xl bg-[var(--ds-panel)] px-3 py-2"
                                key={message.localId}
                            >
                                <div className="min-w-0 flex-1 text-sm text-[var(--app-fg)]">
                                    <TextContent
                                        text={message.text || t('queuedMessages.empty')}
                                        mode="plain"
                                        plainClassName="line-clamp-1 text-sm"
                                    />
                                </div>
                                <Button
                                    size="iconXs"
                                    variant="ghost"
                                    disabled={disabled || canceling}
                                    aria-label={t('queuedMessages.cancel')}
                                    title={t('queuedMessages.cancel')}
                                    className={cn(canceling ? 'opacity-50' : null)}
                                    onClick={() => cancelQueuedMessage(message.localId)}
                                >
                                    <FeatureCloseIcon className="h-4 w-4" />
                                </Button>
                            </div>
                        )
                    })}
                    {overflowCount > 0 ? (
                        <div className="px-3 py-1 text-xs text-[var(--app-hint)]">
                            {t('queuedMessages.more').replace('{count}', `${overflowCount}`)}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
