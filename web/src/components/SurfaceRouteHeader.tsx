import type { ReactNode } from 'react'
import { BackIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
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
                'sticky top-0 z-20 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-canvas)] px-1 py-4 pt-[calc(1rem+env(safe-area-inset-top))]',
                props.className
            )}
        >
            <div className="flex items-center gap-4">
                <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={props.onBack}
                    className="h-11 w-11 rounded-full text-[var(--ds-text-secondary)]"
                    aria-label={t('button.close')}
                >
                    <BackIcon className="h-5 w-5" />
                </Button>

                <div className="min-w-0 flex-1">
                    {props.eyebrow ? (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-text-muted)]">
                            {props.eyebrow}
                        </p>
                    ) : null}

                    <div className="mt-1 flex items-center gap-2">
                        {props.titleIcon ? props.titleIcon : null}
                        <h1 className="text-[28px] font-semibold tracking-[-0.05em] text-[var(--ds-text-primary)]">
                            {props.title}
                        </h1>
                    </div>
                </div>
            </div>
        </header>
    )
}
