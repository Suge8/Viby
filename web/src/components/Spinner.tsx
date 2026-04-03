import { useContext } from 'react'
import { joinClassNames } from '@/components/loading/loadingClassName'
import { LoadingSpinnerIcon } from '@/components/loading/loadingIcons'
import { I18nContext } from '@/lib/i18n-context'

type SpinnerProps = {
    size?: 'sm' | 'md' | 'lg'
    className?: string
    label?: string | null
}

const SPINNER_SIZE_CLASS_NAMES = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
} as const

const FALLBACK_LOADING_LABEL = 'Loading'

export function Spinner({
    size = 'md',
    className,
    label
}: SpinnerProps) {
    const i18n = useContext(I18nContext)
    const effectiveLabel = label === undefined
        ? i18n?.t('loading') ?? FALLBACK_LOADING_LABEL
        : label
    const accessibilityProps = effectiveLabel === null
        ? { 'aria-hidden': true }
        : { role: 'status', 'aria-label': effectiveLabel }

    return (
        <LoadingSpinnerIcon
            className={joinClassNames(SPINNER_SIZE_CLASS_NAMES[size], 'animate-spin text-[var(--app-hint)]', className)}
            {...accessibilityProps}
        />
    )
}
