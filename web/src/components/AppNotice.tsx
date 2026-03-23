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
    switch (tone) {
        case 'info':
            return 'border-[color:color-mix(in_srgb,var(--ds-brand)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_8%,var(--ds-panel-strong))]'
        case 'success':
            return 'border-[color:color-mix(in_srgb,var(--ds-success)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-success)_10%,var(--ds-panel-strong))]'
        case 'warning':
            return 'border-[color:color-mix(in_srgb,var(--ds-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-warning)_10%,var(--ds-panel-strong))]'
        case 'danger':
            return 'border-[color:color-mix(in_srgb,var(--ds-danger)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-danger)_10%,var(--ds-panel-strong))]'
        default:
            return 'border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)]'
    }
}

function getLayoutClassName(layout: AppNoticeLayout, compact: boolean): string {
    if (layout === 'floating') {
        if (compact) {
            return 'rounded-[18px] px-3 py-2 shadow-[0_16px_34px_rgba(13,18,36,0.14)] backdrop-blur-xl sm:rounded-[20px] sm:px-3.5 sm:py-2.5'
        }

        return 'rounded-[var(--ds-radius-xl)] px-3 py-2.5 shadow-[0_20px_42px_rgba(13,18,36,0.16)] backdrop-blur-xl sm:rounded-[var(--ds-radius-2xl)] sm:px-4 sm:py-3 sm:shadow-[0_24px_60px_rgba(13,18,36,0.18)]'
    }

    return 'rounded-[var(--ds-radius-xl)] px-3 py-2 shadow-[var(--ds-shadow-soft)]'
}

function getIconWrapClassName(tone: AppNoticeTone, compact: boolean): string {
    const sizeClassName = compact
        ? 'h-7 w-7 rounded-[14px]'
        : 'h-8 w-8 rounded-2xl'

    switch (tone) {
        case 'info':
            return `${sizeClassName} bg-[color:color-mix(in_srgb,var(--ds-brand)_14%,transparent)] text-[var(--ds-brand)]`
        case 'success':
            return `${sizeClassName} bg-[color:color-mix(in_srgb,var(--ds-success)_16%,transparent)] text-[var(--ds-success)]`
        case 'warning':
            return `${sizeClassName} bg-[color:color-mix(in_srgb,var(--ds-warning)_16%,transparent)] text-[var(--ds-warning)]`
        case 'danger':
            return `${sizeClassName} bg-[color:color-mix(in_srgb,var(--ds-danger)_16%,transparent)] text-[var(--ds-danger)]`
        default:
            return `${sizeClassName} bg-[var(--app-subtle-bg)] text-[var(--app-fg)]`
    }
}

export function AppNotice(props: AppNoticeProps): React.JSX.Element {
    const tone = props.tone ?? 'default'
    const layout = props.layout ?? 'floating'
    const compact = props.compact ?? false

    return (
        <div
            className={cn(
                'ds-banner-enter relative isolate flex w-full overflow-hidden border text-[var(--app-fg)]',
                compact ? 'items-center gap-2.5' : 'items-start gap-3',
                getToneClassName(tone),
                getLayoutClassName(layout, compact),
                props.className
            )}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_38%)] opacity-80"
            />
            {props.icon ? (
                <span className={cn('relative flex shrink-0 items-center justify-center', compact ? '' : 'mt-0.5', getIconWrapClassName(tone, compact))}>
                    {props.icon}
                </span>
            ) : null}
            <div className="min-w-0 flex-1">
                <div className={cn('font-semibold text-[var(--ds-text-primary)]', compact ? 'text-[13px] leading-4.5' : 'text-sm leading-5')}>
                    {props.title}
                </div>
                {props.description ? (
                    <div className={cn('text-[var(--app-hint)]', compact ? 'mt-0.5 text-[11px] leading-4' : 'mt-1 text-xs leading-5')}>
                        {props.description}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
