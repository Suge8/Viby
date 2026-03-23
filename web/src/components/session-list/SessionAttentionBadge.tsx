import { memo } from 'react'
import { useTranslation } from '@/lib/use-translation'

const ATTENTION_BADGE_CLASS_NAME = 'inline-flex min-h-6 items-center gap-1 rounded-full bg-[var(--app-attention-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--app-attention-text)]'
const ATTENTION_ICON_CLASS_NAME = 'h-3.5 w-3.5 shrink-0 fill-current text-[var(--app-attention-text)]'
const COMPACT_ATTENTION_BADGE_CLASS_NAME = 'inline-flex min-h-5 items-center gap-0.5 rounded-full bg-[var(--app-attention-bg)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--app-attention-text)]'
const COMPACT_ATTENTION_ICON_CLASS_NAME = 'h-3 w-3 shrink-0 fill-current text-[var(--app-attention-text)]'

type SessionAttentionBadgeProps = {
    compact?: boolean
}

export const SessionAttentionBadge = memo(function SessionAttentionBadge(
    props: SessionAttentionBadgeProps
): React.JSX.Element {
    const { t } = useTranslation()
    const label = t('session.attention.newReply')
    const className = props.compact ? COMPACT_ATTENTION_BADGE_CLASS_NAME : ATTENTION_BADGE_CLASS_NAME
    const iconClassName = props.compact ? COMPACT_ATTENTION_ICON_CLASS_NAME : ATTENTION_ICON_CLASS_NAME

    return (
        <span
            aria-label={label}
            title={label}
            className={className}
        >
            <SessionAttentionIcon className={iconClassName} />
            <span>{label}</span>
        </span>
    )
})

type SessionAttentionIconProps = {
    className?: string
}

function SessionAttentionIcon(props: SessionAttentionIconProps): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            className={props.className}
        >
            <path d="M8 1.1 9.82 5.08 13.9 6.9 9.82 8.72 8 12.7 6.18 8.72 2.1 6.9 6.18 5.08 8 1.1Z" />
            <path d="M12.45 9.85 13.15 11.55 14.85 12.25 13.15 12.95 12.45 14.65 11.75 12.95 10.05 12.25 11.75 11.55 12.45 9.85Z" />
        </svg>
    )
}
