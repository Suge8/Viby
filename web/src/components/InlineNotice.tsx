import type { ReactNode } from 'react'
import { AppNotice, type AppNoticeTone } from '@/components/AppNotice'
import { AlertIcon, ErrorIcon, InfoIcon, SuccessIcon } from '@/components/icons'

type InlineNoticeProps = {
    tone?: AppNoticeTone
    title: ReactNode
    description?: ReactNode
    icon?: ReactNode
    className?: string
}

export function getNoticeToneIcon(tone: AppNoticeTone | undefined): ReactNode {
    switch (tone) {
        case 'info':
            return <InfoIcon className="h-4 w-4" />
        case 'success':
            return <SuccessIcon className="h-4 w-4" />
        case 'warning':
            return <AlertIcon className="h-4 w-4" />
        case 'danger':
            return <ErrorIcon className="h-4 w-4" />
        default:
            return <InfoIcon className="h-4 w-4" />
    }
}

export function InlineNotice(props: InlineNoticeProps) {
    const tone = props.tone ?? 'default'

    return (
        <AppNotice
            layout="inline"
            tone={tone}
            icon={props.icon ?? getNoticeToneIcon(tone)}
            title={props.title}
            description={props.description}
            className={props.className}
        />
    )
}
