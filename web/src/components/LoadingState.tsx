import type { ReactNode } from 'react'
import { joinClassNames } from '@/components/loading/loadingClassName'
import { StageBrandMark, STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME } from '@/components/StageBrandMark'
import { Spinner } from '@/components/Spinner'
import { LoadingRail } from '@/components/loading/LoadingSkeleton'
import { useTranslation } from '@/lib/use-translation'

const LOADING_PANEL_CLASS_NAME = 'mx-auto flex w-full max-w-[20rem] flex-col items-center gap-4 text-center'
const LOADING_INLINE_CLASS_NAME = 'inline-flex items-center gap-2 text-[var(--app-hint)]'
const LOADING_PANEL_BRAND_MARK_CLASS_NAME = `ds-stage-empty-icon h-20 w-20 ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME}`

type LoadingStateProps = {
    label?: string
    description?: string
    className?: string
    variant?: 'inline' | 'panel'
    icon?: ReactNode
}

type LoadingPanelProps = {
    label: string
    description?: string
    className?: string
    icon?: ReactNode
}

function LoadingPanel(props: LoadingPanelProps): React.JSX.Element {
    return (
        <div
            data-testid="loading-state-hero"
            className={joinClassNames(LOADING_PANEL_CLASS_NAME, props.className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            {props.icon ?? <StageBrandMark className={LOADING_PANEL_BRAND_MARK_CLASS_NAME} />}
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
            className={joinClassNames(LOADING_INLINE_CLASS_NAME, className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <Spinner size="md" label={null} />
            <span>{displayLabel}</span>
        </div>
    )
}
