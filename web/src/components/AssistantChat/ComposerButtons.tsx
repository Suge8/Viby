import type { RefObject } from 'react'
import { ComposerAttachmentButton } from '@/components/AssistantChat/ComposerAttachmentButton'
import { FeatureControlsIcon as ControlsIcon } from '@/components/featureIcons'
import { SendIcon, SpinnerIcon, StopIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import { COMPOSER_CONTROLS_BUTTON_TEST_ID, COMPOSER_PRIMARY_ACTION_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'
import { useTranslation } from '@/lib/use-translation'

const CONTROL_BUTTON_CLASS_NAME =
    'h-10 rounded-full border-[color:color-mix(in_srgb,var(--ds-border-default)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel)_96%,transparent)] px-3 text-sm font-medium text-[var(--app-hint)] shadow-[0_6px_18px_rgba(9,15,35,0.06)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-panel-strong)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50'
const ACTIVE_CONTROL_BUTTON_CLASS_NAME =
    'border-[color:color-mix(in_srgb,var(--ds-brand)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,var(--ds-panel-strong))] text-[var(--ds-brand)] shadow-[var(--ds-shadow-soft)]'

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
    controlsAnchorRef?: RefObject<HTMLDivElement | null>
    controlsButton: ComposerToggleButtonState
    primaryAction: ComposerPrimaryActionState
}

function getControlsButtonClassName(active?: boolean): string {
    if (active) {
        return `${CONTROL_BUTTON_CLASS_NAME} ${ACTIVE_CONTROL_BUTTON_CLASS_NAME}`
    }

    return CONTROL_BUTTON_CLASS_NAME
}

function getPrimaryButtonPresentation(
    props: ComposerPrimaryActionState,
    t: ReturnType<typeof useTranslation>['t']
): {
    icon: React.JSX.Element
    label: string
} {
    if (props.mode !== 'stop') {
        return {
            icon: <SendIcon className="h-4 w-4" />,
            label: t('composer.send'),
        }
    }

    if (props.busy) {
        return {
            icon: <SpinnerIcon className="h-4 w-4 animate-spin" />,
            label: t('composer.stopping'),
        }
    }

    return {
        icon: <StopIcon className="h-4 w-4" />,
        label: t('composer.stop'),
    }
}

function PrimaryButton(props: ComposerPrimaryActionState): React.JSX.Element {
    const { t } = useTranslation()
    const { icon, label } = getPrimaryButtonPresentation(props, t)

    return (
        <Button
            data-testid={COMPOSER_PRIMARY_ACTION_BUTTON_TEST_ID}
            type="button"
            size="iconSm"
            pressStyle="button"
            onClick={props.onClick}
            disabled={props.disabled}
            aria-label={label}
            title={label}
        >
            {icon}
        </Button>
    )
}

export function ComposerButtons(props: ComposerButtonsProps): React.JSX.Element {
    const { t } = useTranslation()
    const controlsLabel = t('composer.controls')
    const attachLabel = t('composer.attach')

    return (
        <div className="flex items-center justify-between px-2 pb-1 sm:pb-2">
            <div className="flex items-center gap-1">
                {props.attachmentsSupported ? (
                    <ComposerAttachmentButton
                        ariaLabel={attachLabel}
                        title={attachLabel}
                        disabled={props.attachmentDisabled}
                        className={ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}
                    />
                ) : null}

                {props.controlsButton.visible ? (
                    <div ref={props.controlsAnchorRef} className="flex items-center">
                        <Button
                            data-testid={COMPOSER_CONTROLS_BUTTON_TEST_ID}
                            type="button"
                            size="sm"
                            variant="secondary"
                            pressStyle="button"
                            aria-label={controlsLabel}
                            title={controlsLabel}
                            disabled={props.controlsButton.disabled}
                            className={getControlsButtonClassName(props.controlsButton.active)}
                            onClick={props.controlsButton.onToggle}
                        >
                            <ControlsIcon className="h-4.5 w-4.5" />
                            <span className="hidden sm:inline">{controlsLabel}</span>
                        </Button>
                    </div>
                ) : null}
            </div>

            <PrimaryButton {...props.primaryAction} />
        </div>
    )
}
