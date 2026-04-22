import { memo, type ReactNode, useCallback, useMemo } from 'react'
import { CopyActionButton } from '@/components/CopyActionButton'
import { useCopyAction } from '@/hooks/useCopyAction'
import { COPY_FEEDBACK_DURATION_MS } from '@/lib/copyFeedback'
import { useNoticeCenter } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'

export type MessageSurfaceTone = 'assistant' | 'user'
export type MessageSurfaceContentLayout = 'default' | 'media-only'

const DEFAULT_MESSAGE_SURFACE_CONTENT_LAYOUT: MessageSurfaceContentLayout = 'default'

type MessageSurfaceProps = {
    children: ReactNode
    tone: MessageSurfaceTone
    contentLayout?: MessageSurfaceContentLayout
    copyText?: string | null
    className?: string
}

function getSurfaceToneClassName(tone: MessageSurfaceTone): string {
    switch (tone) {
        case 'user':
            return 'ds-message-surface-user'
        default:
            return 'ds-message-surface-assistant'
    }
}

function MessageSurfaceComponent(props: MessageSurfaceProps): React.JSX.Element {
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const contentLayout = props.contentLayout ?? DEFAULT_MESSAGE_SURFACE_CONTENT_LAYOUT
    const normalizedCopyText = useMemo(() => props.copyText?.trim() ?? '', [props.copyText])
    const isCopyable = normalizedCopyText.length > 0
    const surfaceClassName = useMemo(() => {
        return cn(
            'ds-message-surface',
            getSurfaceToneClassName(props.tone),
            isCopyable ? 'ds-message-surface-copyable' : null,
            props.className
        )
    }, [isCopyable, props.className, props.tone])

    const handleCopied = useCallback((): void => {
        addToast({
            tone: 'success',
            title: t('chat.messageCopied.title'),
            description: t('chat.messageCopied.description'),
            dismissAfterMs: COPY_FEEDBACK_DURATION_MS,
        })
    }, [addToast, t])
    const { copied, handleCopyClick } = useCopyAction({
        text: normalizedCopyText,
        enabled: isCopyable,
        onCopied: handleCopied,
    })

    return (
        <div
            className={surfaceClassName}
            data-copyable={isCopyable ? 'true' : undefined}
            data-copied={copied ? 'true' : undefined}
            data-content-layout={contentLayout}
        >
            <div
                className="ds-message-surface-copy-content z-10 min-w-0"
                data-has-trailing-action={isCopyable ? 'true' : undefined}
            >
                {props.children}
            </div>
            {isCopyable ? (
                <CopyActionButton
                    label={t('chat.messageCopyHint')}
                    copied={copied}
                    copiedLabel={t('chat.messageCopied.badge')}
                    onCopy={(event) => void handleCopyClick(event)}
                    className="ds-message-copy-button"
                    variant="floating"
                    placement="bubble-trailing"
                />
            ) : null}
        </div>
    )
}

export const MessageSurface = memo(MessageSurfaceComponent)
MessageSurface.displayName = 'MessageSurface'
