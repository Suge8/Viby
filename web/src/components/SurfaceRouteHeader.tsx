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
    eyebrow?: string
    titleIcon?: ReactNode
    className?: string
}

export function SurfaceRouteHeader(props: SurfaceRouteHeaderProps): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <header
            className={cn(
                'ds-surface-route-header sticky top-0 z-20 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-canvas)] px-1 py-4',
                props.className
            )}
        >
            <MotionStaggerGroup className="flex items-center gap-4" delay={0.02} stagger={0.08}>
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

                <MotionStaggerItem className="min-w-0 flex-1" y={18}>
                    <div className="min-w-0">
                        {props.eyebrow ? (
                            <p className="ds-surface-route-header-eyebrow font-semibold uppercase text-[var(--ds-text-muted)]">
                                {props.eyebrow}
                            </p>
                        ) : null}

                        <div className="mt-1 flex items-center gap-2">
                            {props.titleIcon ? props.titleIcon : null}
                            <h1 className="ds-surface-route-header-title font-semibold text-[var(--ds-text-primary)]">
                                {props.title}
                            </h1>
                        </div>
                    </div>
                </MotionStaggerItem>
            </MotionStaggerGroup>
        </header>
    )
}
