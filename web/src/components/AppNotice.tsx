import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type AppNoticeTone = 'default' | 'info' | 'success' | 'warning' | 'danger'
type AppNoticeLayout = 'floating' | 'inline'

type AppNoticeProps = {
    title: ReactNode
    description?: ReactNode
    icon?: ReactNode
    tone?: AppNoticeTone
    layout?: AppNoticeLayout
    compact?: boolean
    className?: string
}

function getToneClassName(tone: AppNoticeTone): string {
    return tone
}

function getIconWrapClassName(tone: AppNoticeTone, compact: boolean): string {
    return `${tone}:${compact ? 'compact' : 'regular'}`
}

export function AppNotice(props: AppNoticeProps): React.JSX.Element {
    const tone = props.tone ?? 'default'
    const layout = props.layout ?? 'floating'
    const compact = props.compact ?? false

    return (
        <div
            className={cn('ds-app-notice', compact ? 'items-center gap-2.5' : 'items-start gap-3', props.className)}
            data-tone={getToneClassName(tone)}
            data-layout={layout}
            data-compact={compact ? 'true' : 'false'}
        >
            {props.icon ? (
                <span
                    className={cn('ds-app-notice-icon', getIconWrapClassName(tone, compact))}
                    data-tone={tone}
                    data-compact={compact ? 'true' : 'false'}
                >
                    {props.icon}
                </span>
            ) : null}
            <div className="min-w-0 flex-1">
                <div className="ds-app-notice-title" data-compact={compact ? 'true' : 'false'}>
                    {props.title}
                </div>
                {props.description ? (
                    <div className="ds-app-notice-description" data-compact={compact ? 'true' : 'false'}>
                        {props.description}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
