import type { JSX } from 'react'
import { BrandMarkIcon, SettingsIcon } from '@/components/icons'
import { MotionReveal } from '@/components/motion/motionPrimitives'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import { SESSIONS_SHELL_SETTINGS_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'
import { cn } from '@/lib/utils'

const HEADER_ACTION_BUTTON_CLASS_NAME = `ds-sessions-shell-action-button ${ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME} backdrop-blur-xl`
const BRAND_TITLE_FRAME_CLASS_NAME = 'ds-sessions-shell-header-frame'
const BRAND_TITLE_CLASS_NAME = 'ds-sessions-shell-header-title'

type SessionsHeaderActionButtonProps = {
    title: string
    onClick: () => void
    className?: string
    testId?: string
    children: JSX.Element
}

type SessionsShellHeaderProps = {
    settingsTitle: string
    onOpenSettings: () => void
}

function SessionsHeaderActionButton(props: SessionsHeaderActionButtonProps): JSX.Element {
    return (
        <Button
            type="button"
            size="iconXs"
            variant="secondary"
            onClick={props.onClick}
            className={cn(HEADER_ACTION_BUTTON_CLASS_NAME, props.className)}
            data-testid={props.testId}
            title={props.title}
            aria-label={props.title}
        >
            {props.children}
        </Button>
    )
}

export function SessionsShellHeader(props: SessionsShellHeaderProps): JSX.Element {
    return (
        <MotionReveal className="ds-sessions-shell-header" duration={0.36} y={18}>
            <div className="mx-auto w-full max-w-content px-3 pb-3 pt-4">
                <div className="ds-sessions-shell-header-row relative">
                    <div className={BRAND_TITLE_FRAME_CLASS_NAME}>
                        <span className={BRAND_TITLE_CLASS_NAME}>Viby</span>
                    </div>
                    <div className="ds-sessions-shell-header-row relative z-10 flex items-center justify-between gap-3">
                        <BrandMarkIcon className="ds-sessions-shell-brand-mark h-11 w-11" />
                        <SessionsHeaderActionButton
                            title={props.settingsTitle}
                            onClick={props.onOpenSettings}
                            testId={SESSIONS_SHELL_SETTINGS_BUTTON_TEST_ID}
                        >
                            <SettingsIcon className="ds-sessions-shell-action-icon h-4.5 w-4.5" />
                        </SessionsHeaderActionButton>
                    </div>
                </div>
            </div>
        </MotionReveal>
    )
}
