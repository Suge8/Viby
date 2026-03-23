import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SurfaceGroupCardProps = {
    title?: string
    icon?: ReactNode
    children: ReactNode
    className?: string
}

export function SurfaceGroupCard(props: SurfaceGroupCardProps): React.JSX.Element {
    return (
        <section
            aria-label={props.title}
            className={cn(
                'overflow-hidden rounded-[24px] border border-[var(--ds-border-default)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-panel-strong)_97%,transparent),color-mix(in_srgb,var(--ds-panel)_92%,transparent))] shadow-[var(--ds-shadow-soft)]',
                props.className
            )}
        >
            {props.title ? (
                <div className="flex items-center gap-2.5 px-4 py-4 sm:px-5">
                    {props.icon ? (
                        <span className="text-[var(--ds-text-secondary)]">
                            {props.icon}
                        </span>
                    ) : null}
                    <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-[var(--ds-text-primary)]">
                        {props.title}
                    </h2>
                </div>
            ) : null}
            {props.children}
        </section>
    )
}
