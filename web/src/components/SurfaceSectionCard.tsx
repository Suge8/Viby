import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type SurfaceSectionAccentTone = 'coral' | 'lime' | 'gold' | 'violet'

const ACCENT_STYLES: Record<SurfaceSectionAccentTone, { glow: string; icon: string; badge: string }> = {
    coral: {
        glow: 'bg-[color-mix(in_srgb,var(--ds-accent-coral)_18%,transparent)]',
        icon: 'bg-[color-mix(in_srgb,var(--ds-accent-coral)_14%,var(--ds-panel-strong))] text-[var(--ds-accent-coral)]',
        badge: 'bg-[color-mix(in_srgb,var(--ds-accent-coral)_10%,transparent)] text-[var(--ds-accent-coral)]'
    },
    lime: {
        glow: 'bg-[color-mix(in_srgb,var(--ds-accent-lime)_18%,transparent)]',
        icon: 'bg-[color-mix(in_srgb,var(--ds-accent-lime)_14%,var(--ds-panel-strong))] text-[var(--ds-accent-lime)]',
        badge: 'bg-[color-mix(in_srgb,var(--ds-accent-lime)_10%,transparent)] text-[var(--ds-accent-lime)]'
    },
    gold: {
        glow: 'bg-[color-mix(in_srgb,var(--ds-accent-gold)_18%,transparent)]',
        icon: 'bg-[color-mix(in_srgb,var(--ds-accent-gold)_14%,var(--ds-panel-strong))] text-[var(--ds-accent-gold)]',
        badge: 'bg-[color-mix(in_srgb,var(--ds-accent-gold)_10%,transparent)] text-[var(--ds-accent-gold)]'
    },
    violet: {
        glow: 'bg-[color-mix(in_srgb,var(--ds-accent-violet)_18%,transparent)]',
        icon: 'bg-[color-mix(in_srgb,var(--ds-accent-violet)_14%,var(--ds-panel-strong))] text-[var(--ds-accent-violet)]',
        badge: 'bg-[color-mix(in_srgb,var(--ds-accent-violet)_10%,transparent)] text-[var(--ds-accent-violet)]'
    },
}

type SurfaceSectionCardProps = {
    badge?: string
    title: string
    description?: string
    icon: ReactNode
    accent?: SurfaceSectionAccentTone
    children: ReactNode
    className?: string
}

export function SurfaceSectionCard(props: SurfaceSectionCardProps): React.JSX.Element {
    const accent = ACCENT_STYLES[props.accent ?? 'lime']

    return (
        <section
            className={cn(
                'relative overflow-hidden rounded-[26px] border border-[var(--ds-border-default)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-panel-strong)_97%,transparent),color-mix(in_srgb,var(--ds-panel)_92%,transparent))] p-4 shadow-[var(--ds-shadow-soft)] backdrop-blur sm:p-4.5',
                props.className
            )}
        >
            <div className={cn('pointer-events-none absolute -right-8 top-0 h-20 w-20 rounded-full blur-3xl', accent.glow)} />
            <div className="relative">
                <div className="flex items-start gap-3.5">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ds-border-default)]', accent.icon)}>
                        {props.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                        {props.badge ? (
                            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', accent.badge)}>
                                {props.badge}
                            </span>
                        ) : null}
                        <h2
                            className={cn(
                                'text-base font-semibold tracking-[-0.04em] text-[var(--ds-text-primary)] sm:text-[17px]',
                                props.badge ? 'mt-2.5' : 'mt-0.5'
                            )}
                        >
                            {props.title}
                        </h2>
                        {props.description ? (
                            <p className="mt-1 text-[13px] leading-5 text-[var(--ds-text-secondary)] sm:text-sm sm:leading-6">
                                {props.description}
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="mt-4">
                    {props.children}
                </div>
            </div>
        </section>
    )
}
