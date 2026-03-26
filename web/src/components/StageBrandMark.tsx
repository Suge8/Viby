import { BrandMarkIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

export const STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME = 'text-[color:color-mix(in_srgb,var(--ds-text-primary)_92%,var(--ds-text-secondary))]'

type StageBrandMarkProps = {
    className?: string
    markClassName?: string
}

export function StageBrandMark(props: StageBrandMarkProps): React.JSX.Element {
    return (
        <span
            aria-hidden="true"
            className={cn('relative inline-flex shrink-0 items-center justify-center', props.className)}
        >
            <BrandMarkIcon
                className={cn('relative h-[78%] w-[78%] text-current', props.markClassName)}
            />
        </span>
    )
}
