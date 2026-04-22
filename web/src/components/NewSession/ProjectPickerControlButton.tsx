import { Button } from '@/components/ui/button'

type ProjectPickerControlButtonProps = {
    icon: React.JSX.Element
    label: string
    isDisabled?: boolean
    onClick: () => void
    className: string
}

export function ProjectPickerControlButton(props: ProjectPickerControlButtonProps): React.JSX.Element {
    return (
        <Button
            type="button"
            size="iconSm"
            variant="secondary"
            onClick={props.onClick}
            disabled={props.isDisabled}
            className={props.className}
            aria-label={props.label}
        >
            {props.icon}
        </Button>
    )
}
