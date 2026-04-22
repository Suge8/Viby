import type { ReactNode } from 'react'
import { BackIcon } from '@/components/icons'
import { MotionReveal } from '@/components/motion/motionPrimitives'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import { SESSION_ROUTE_BACK_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'

type SessionRouteHeaderProps = {
    title: string
    subtitle: string
    onBack: () => void
    actions?: ReactNode
}

export function SessionRouteHeader(props: SessionRouteHeaderProps): ReactNode {
    return (
        <MotionReveal duration={0.34} y={16}>
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex w-full ds-stage-shell items-center gap-2 border-b border-[var(--app-border)] p-3">
                    <Button
                        type="button"
                        size="iconSm"
                        variant="secondary"
                        onClick={props.onBack}
                        data-testid={SESSION_ROUTE_BACK_BUTTON_TEST_ID}
                        className={ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}
                    >
                        <BackIcon className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{props.title}</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{props.subtitle}</div>
                    </div>
                    {props.actions ?? null}
                </div>
            </div>
        </MotionReveal>
    )
}
