import { Button } from '@/components/ui/button'

const PROJECT_PICKER_CONTROL_BUTTON_CLASS_NAME =
    'h-9 w-9 rounded-full text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text-primary)] disabled:opacity-40'

type ProjectPickerControlButtonProps = {
    icon: React.JSX.Element
    label: string
    isDisabled?: boolean
    onClick: () => void
    className?: string
}

export function ProjectPickerControlButton(props: ProjectPickerControlButtonProps): React.JSX.Element {
    return (
        <Button
            type="button"
            size="iconSm"
            variant="secondary"
            pressStyle="icon"
            onClick={props.onClick}
            disabled={props.isDisabled}
            className={props.className ?? PROJECT_PICKER_CONTROL_BUTTON_CLASS_NAME}
            aria-label={props.label}
        >
            {props.icon}
        </Button>
    )
}
