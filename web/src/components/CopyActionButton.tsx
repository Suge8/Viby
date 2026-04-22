import { memo } from 'react'
import { FeatureCheckIcon as CheckIcon, FeatureCopyIcon as CopyIcon } from '@/components/featureIcons'
import { Button } from '@/components/ui/button'
import {
    ICON_ONLY_BUTTON_CONTEXTUAL_CLASS_NAME,
    ICON_ONLY_BUTTON_FLOATING_CONTEXTUAL_CLASS_NAME,
} from '@/components/ui/iconButtonStyles'
import { cn } from '@/lib/utils'

type CopyActionButtonProps = {
    label: string
    copied: boolean
    onCopy: (event: React.MouseEvent<HTMLButtonElement>) => void
    copiedLabel?: string
    className?: string
    variant?: 'contextual' | 'floating'
    placement?: 'inline' | 'bubble-trailing'
}

function CopyActionButtonComponent(props: CopyActionButtonProps): React.JSX.Element {
    const { className, copied, copiedLabel, label, onCopy } = props
    const variant = props.variant ?? 'contextual'
    const placement = props.placement ?? 'inline'
    const title = copied ? (copiedLabel ?? label) : label
    const button = (
        <Button
            type="button"
            variant={variant === 'floating' ? 'outline' : 'plain'}
            size="iconSm"
            pointerEffect="none"
            className={cn(
                variant === 'floating'
                    ? ICON_ONLY_BUTTON_FLOATING_CONTEXTUAL_CLASS_NAME
                    : ICON_ONLY_BUTTON_CONTEXTUAL_CLASS_NAME,
                placement === 'bubble-trailing'
                    ? 'pointer-events-auto opacity-72 hover:opacity-100 focus-visible:opacity-100'
                    : 'shrink-0',
                className
            )}
            aria-label={label}
            title={title}
            data-copied={copied ? 'true' : undefined}
            onClick={onCopy}
            data-prevent-message-copy
        >
            {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
        </Button>
    )

    if (placement === 'bubble-trailing') {
        return (
            <div className="pointer-events-none absolute z-20 [bottom:var(--ds-message-trailing-action-offset)] [right:var(--ds-message-trailing-action-offset)]">
                {button}
            </div>
        )
    }

    return button
}

export const CopyActionButton = memo(CopyActionButtonComponent)
CopyActionButton.displayName = 'CopyActionButton'
