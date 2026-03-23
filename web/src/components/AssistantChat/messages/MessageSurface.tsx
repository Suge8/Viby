import { memo, useCallback, useMemo, type ReactNode } from 'react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useNoticeCenter } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'

const COPY_SUCCESS_DISMISS_MS = 1_800

const COPY_GUARD_SELECTOR = [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[contenteditable="true"]',
    '[data-prevent-message-copy]'
].join(',')

export type MessageSurfaceTone = 'assistant' | 'user'

type MessageSurfaceProps = {
    children: ReactNode
    tone: MessageSurfaceTone
    copyText?: string | null
    className?: string
}

function shouldIgnoreCopyTarget(target: EventTarget | null, container: HTMLDivElement): boolean {
    if (!(target instanceof HTMLElement)) {
        return false
    }

    const guardedTarget = target.closest(COPY_GUARD_SELECTOR)
    return guardedTarget !== null && guardedTarget !== container && container.contains(guardedTarget)
}

function MessageSurfaceComponent(props: MessageSurfaceProps): React.JSX.Element {
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const { copied, copy } = useCopyToClipboard()

    const normalizedCopyText = useMemo(() => props.copyText?.trim() ?? '', [props.copyText])
    const isCopyable = normalizedCopyText.length > 0
    const surfaceClassName = useMemo(() => {
        return cn(
            'ds-message-surface',
            props.tone === 'user' ? 'ds-message-surface-user' : 'ds-message-surface-assistant',
            isCopyable ? 'ds-message-surface-copyable' : null,
            props.className
        )
    }, [isCopyable, props.className, props.tone])

    const handleCopy = useCallback(async (): Promise<void> => {
        if (!isCopyable) {
            return
        }

        const didCopy = await copy(normalizedCopyText)
        if (!didCopy) {
            return
        }

        addToast({
            tone: 'success',
            title: t('chat.messageCopied.title'),
            description: t('chat.messageCopied.description'),
            dismissAfterMs: COPY_SUCCESS_DISMISS_MS
        })
    }, [addToast, copy, isCopyable, normalizedCopyText, t])

    const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
        if (!isCopyable || event.defaultPrevented) {
            return
        }

        if (shouldIgnoreCopyTarget(event.target, event.currentTarget)) {
            return
        }

        void handleCopy()
    }, [handleCopy, isCopyable])

    return (
        <div
            className={surfaceClassName}
            data-copyable={isCopyable ? 'true' : undefined}
            data-copied={copied ? 'true' : undefined}
            title={isCopyable ? t('chat.messageCopyHint') : undefined}
            onClick={handleClick}
        >
            <div className="relative z-10 min-w-0">
                {props.children}
            </div>
        </div>
    )
}

export const MessageSurface = memo(MessageSurfaceComponent)
MessageSurface.displayName = 'MessageSurface'
