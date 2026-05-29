import type { ReactNode } from 'react'
import { BackIcon } from '@/components/icons'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'

type SurfaceRouteHeaderProps = {
    title: string
    onBack: () => void
    titleIcon?: ReactNode
    className?: string
}

const TITLE_ICON_FRAME_CLASS_NAME =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ds-radius-md)] bg-[color:color-mix(in_srgb,var(--ds-brand)_12%,var(--ds-panel)_88%)] text-[var(--ds-brand)] ring-1 ring-[color:color-mix(in_srgb,var(--ds-brand)_24%,var(--ds-border-default))]'

export function SurfaceRouteHeader(props: SurfaceRouteHeaderProps): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <header
            className={cn(
                'ds-surface-route-header sticky top-0 z-20 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-canvas)] px-1 py-4',
                props.className
            )}
        >
            <MotionStaggerGroup
                className="ds-stage-shell grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-3"
                delay={0.02}
                stagger={0.08}
            >
                <MotionStaggerItem x={-18} y={0}>
                    <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        onClick={props.onBack}
                        className={`h-11 w-11 ${ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}`}
                        aria-label={t('button.close')}
                    >
                        <BackIcon className="h-5 w-5" />
                    </Button>
                </MotionStaggerItem>

                <MotionStaggerItem className="min-w-0 justify-self-center" y={12}>
                    <div className="flex min-w-0 items-center justify-center gap-3">
                        {props.titleIcon ? (
                            <span className={TITLE_ICON_FRAME_CLASS_NAME}>{props.titleIcon}</span>
                        ) : null}
                        <h1 className="ds-surface-route-header-title truncate font-semibold text-[var(--ds-text-primary)]">
                            {props.title}
                        </h1>
                    </div>
                </MotionStaggerItem>

                <span aria-hidden="true" />
            </MotionStaggerGroup>
        </header>
    )
}
