import {
    SendIcon,
    SpinnerIcon,
    StopIcon,
} from '@/components/icons'
import { FeatureControlsIcon as ControlsIcon } from '@/components/featureIcons'
import { ComposerAttachmentButton } from '@/components/AssistantChat/ComposerAttachmentButton'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

const ICON_BUTTON_CLASS_NAME = 'h-10 w-10 rounded-full border-[color:color-mix(in_srgb,var(--ds-border-default)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel)_96%,transparent)] text-[var(--app-hint)] shadow-[0_6px_18px_rgba(9,15,35,0.06)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-panel-strong)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50'
const CONTROL_BUTTON_CLASS_NAME = 'h-10 rounded-full border-[color:color-mix(in_srgb,var(--ds-border-default)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel)_96%,transparent)] px-3.5 text-sm font-medium text-[var(--app-hint)] shadow-[0_6px_18px_rgba(9,15,35,0.06)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-panel-strong)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50'
const ACTIVE_CONTROL_BUTTON_CLASS_NAME = 'border-[color:color-mix(in_srgb,var(--ds-brand)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,var(--ds-panel-strong))] text-[var(--ds-brand)] shadow-[var(--ds-shadow-soft)]'

type ComposerToggleButtonState = {
    visible: boolean
    disabled: boolean
    active?: boolean
    onToggle: () => void
}

type ComposerPrimaryActionState = {
    mode: 'send' | 'stop'
    disabled: boolean
    busy: boolean
    onClick: () => void
}

type ComposerButtonsProps = {
    attachmentsSupported: boolean
    attachmentDisabled: boolean
    controlsButton: ComposerToggleButtonState
    primaryAction: ComposerPrimaryActionState
}

function getPrimaryButtonLabel(
    props: ComposerPrimaryActionState,
    t: ReturnType<typeof useTranslation>['t']
): string {
    if (props.mode !== 'stop') {
        return t('composer.send')
    }

    if (props.busy) {
        return t('composer.stopping')
    }

    return t('composer.stop')
}

function getPrimaryButtonIcon(props: ComposerPrimaryActionState): React.JSX.Element {
    if (props.mode !== 'stop') {
        return <SendIcon className="h-4 w-4" />
    }

    if (props.busy) {
        return <SpinnerIcon className="h-4 w-4 animate-spin" />
    }

    return <StopIcon className="h-4 w-4" />
}

function getControlsButtonClassName(active?: boolean): string {
    if (active) {
        return `${CONTROL_BUTTON_CLASS_NAME} ${ACTIVE_CONTROL_BUTTON_CLASS_NAME}`
    }

    return CONTROL_BUTTON_CLASS_NAME
}

function PrimaryButton(props: ComposerPrimaryActionState): React.JSX.Element {
    const { t } = useTranslation()
    const label = getPrimaryButtonLabel(props, t)
    const icon = getPrimaryButtonIcon(props)

    return (
        <Button
            type="button"
            size="iconSm"
            pressStyle="button"
            onClick={props.onClick}
            disabled={props.disabled}
            aria-label={label}
            title={label}
            className="h-10 w-10 rounded-[var(--ds-radius-lg)]"
        >
            {icon}
        </Button>
    )
}

export function ComposerButtons(props: ComposerButtonsProps): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div className="flex items-center justify-between px-2 pb-1 sm:pb-2">
            <div className="flex items-center gap-1">
                {props.attachmentsSupported ? (
                    <ComposerAttachmentButton
                        ariaLabel={t('composer.attach')}
                        title={t('composer.attach')}
                        disabled={props.attachmentDisabled}
                        className={ICON_BUTTON_CLASS_NAME}
                    />
                ) : null}

                {props.controlsButton.visible ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        pressStyle="button"
                        aria-label={t('composer.controls')}
                        title={t('composer.controls')}
                        disabled={props.controlsButton.disabled}
                        className={getControlsButtonClassName(props.controlsButton.active)}
                        onClick={props.controlsButton.onToggle}
                    >
                        <ControlsIcon className="h-4.5 w-4.5" />
                        <span>{t('composer.controls')}</span>
                    </Button>
                ) : null}
            </div>

            <PrimaryButton {...props.primaryAction} />
        </div>
    )
}
