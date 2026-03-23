import type { ReactNode } from 'react'
import { WorkspaceIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import { LoadingRail } from '@/components/loading/LoadingSkeleton'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

type LoadingStateProps = {
    label?: string
    description?: string
    className?: string
    variant?: 'inline' | 'panel'
    icon?: ReactNode
}

function LoadingPanel(props: {
    label: string
    description?: string
    className?: string
    icon?: ReactNode
}): React.JSX.Element {
    return (
        <div
            data-testid="loading-state-hero"
            className={cn(
                'mx-auto flex w-full max-w-[20rem] flex-col items-center gap-4 text-center',
                props.className
            )}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="relative flex h-14 w-14 items-center justify-center rounded-[20px] border border-[color:color-mix(in_srgb,var(--ds-brand)_16%,var(--ds-border-default))] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--ds-panel-strong)_94%,var(--ds-brand)_6%)_0%,color-mix(in_srgb,var(--ds-panel-strong)_92%,var(--ds-accent-coral)_8%)_100%)] text-[var(--ds-brand)] shadow-[0_20px_44px_rgba(9,15,35,0.1)]">
                <div className="ds-loading-orb absolute inset-[5px] rounded-[16px] bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--ds-brand)_18%,transparent),transparent_72%)]" />
                <div className="relative z-10">
                    {props.icon ?? <WorkspaceIcon className="h-5 w-5" />}
                </div>
            </div>
            <div className="space-y-1">
                <p className="text-sm font-semibold tracking-[-0.02em] text-[var(--app-fg)]">
                    {props.label}
                </p>
                {props.description ? (
                    <p className="text-sm leading-6 text-[var(--app-hint)]">
                        {props.description}
                    </p>
                ) : null}
            </div>
            <LoadingRail />
        </div>
    )
}

export function LoadingState({
    label,
    description,
    className,
    variant = 'inline',
    icon,
}: LoadingStateProps): React.JSX.Element {
    const { t } = useTranslation()
    const displayLabel = label ?? t('loading')

    if (variant === 'panel') {
        return (
            <LoadingPanel
                label={displayLabel}
                description={description}
                className={className}
                icon={icon}
            />
        )
    }

    return (
        <div
            className={cn('inline-flex items-center gap-2 text-[var(--app-hint)]', className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <Spinner size="md" label={null} />
            <span>{displayLabel}</span>
        </div>
    )
}
