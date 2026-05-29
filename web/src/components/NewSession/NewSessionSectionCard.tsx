import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type NewSessionSectionAccent = 'coral' | 'lime' | 'gold' | 'violet'

const ACCENT_TEXT_CLASS_NAME: Record<NewSessionSectionAccent, string> = {
    coral: 'text-[var(--ds-accent-coral)]',
    lime: 'text-[var(--ds-accent-lime)]',
    gold: 'text-[var(--ds-accent-gold)]',
    violet: 'text-[var(--ds-accent-violet)]',
}

type NewSessionSectionCardProps = {
    title: string
    icon: ReactNode
    accent?: NewSessionSectionAccent
    description?: string
    children: ReactNode
    className?: string
    headerAction?: ReactNode
}

export function NewSessionSectionCard(props: NewSessionSectionCardProps): React.JSX.Element {
    const accentClass = ACCENT_TEXT_CLASS_NAME[props.accent ?? 'lime']
    return (
        <section className={cn('ds-new-section-card', props.className)}>
            <header className="ds-new-section-card-header">
                <span className={cn('ds-new-section-card-icon', accentClass)}>{props.icon}</span>
                <span className="ds-new-section-card-title">{props.title}</span>
                {props.headerAction ? <span className="ds-new-section-card-action">{props.headerAction}</span> : null}
            </header>
            {props.description ? <p className="ds-new-section-card-description">{props.description}</p> : null}
            <div className="ds-new-section-card-body">{props.children}</div>
        </section>
    )
}
