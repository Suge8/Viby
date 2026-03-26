import { memo } from 'react'
import { ArchiveIcon, BrandMarkIcon, SendIcon, StopIcon, SpinnerIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'
import type { SessionStatePresentation } from './sessionStatePresentation'

const SESSION_STATE_BADGE_CLASS_NAME = 'inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold'
const SESSION_STATE_ICON_FRAME_CLASS_NAME = 'relative inline-flex h-4 w-4 shrink-0 items-center justify-center'

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
        <span className={`${SESSION_STATE_BADGE_CLASS_NAME} ${props.presentation.badgeClassName}`}>
            <span className={SESSION_STATE_ICON_FRAME_CLASS_NAME}>
                <span className={`relative ${props.presentation.badgeIconClassName}`}>
                    {icon}
                </span>
            </span>
            <span>{t(props.presentation.labelKey)}</span>
        </span>
    )
})

function getBadgeIcon(iconName: SessionStatePresentation['badgeIconName']): React.JSX.Element {
    switch (iconName) {
        case 'processing':
            return <SpinnerIcon className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={3.2} />
        case 'awaitingInput':
            return <SendIcon className="h-4 w-4" />
        case 'closed':
            return <StopIcon className="h-4 w-4" />
        case 'archived':
            return <ArchiveIcon className="h-4 w-4" />
        default:
            return <BrandMarkIcon className="h-4 w-4" />
    }
}
