import { memo } from 'react'
import { ArchiveIcon, BrandIcon, SendIcon, StopIcon, SpinnerIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'
import type { SessionStatePresentation } from './sessionStatePresentation'

type SessionStateBadgeProps = {
    presentation: Pick<
        SessionStatePresentation,
        'badgeClassName' | 'badgeIconClassName' | 'badgeIconName' | 'labelKey'
    >
}

export const SessionStateBadge = memo(function SessionStateBadge(props: SessionStateBadgeProps): React.JSX.Element {
    const { t } = useTranslation()
    const icon = getBadgeIcon(props.presentation.badgeIconName)

    return (
        <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${props.presentation.badgeClassName}`}>
            <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                <span className={`relative ${props.presentation.badgeIconClassName}`}>
                    {icon}
                </span>
            </span>
            <span>{t(props.presentation.labelKey)}</span>
        </span>
    )
})

function getBadgeIcon(iconName: SessionStatePresentation['badgeIconName']): React.JSX.Element {
    if (iconName === 'processing') {
        return <SpinnerIcon className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={3.2} />
    }

    if (iconName === 'awaitingInput') {
        return <SendIcon className="h-4 w-4" />
    }

    if (iconName === 'closed') {
        return <StopIcon className="h-4 w-4" />
    }

    if (iconName === 'archived') {
        return <ArchiveIcon className="h-4 w-4" />
    }

    return <BrandIcon className="h-4 w-4" />
}
