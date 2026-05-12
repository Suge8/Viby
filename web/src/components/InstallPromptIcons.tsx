import { Icon } from 'lucide-react'
import { type CSSProperties, type JSX } from 'react'
import { cn } from '@/lib/utils'

type LabIconNode = ReadonlyArray<readonly [string, Record<string, string>]>
export type InstallTone = 'coral' | 'gold' | 'violet'

export const INSTALL_ICON_TONES: Record<InstallTone, CSSProperties> = {
    coral: {
        color: 'var(--ds-accent-coral)',
        background: 'color-mix(in srgb, var(--ds-accent-coral) 16%, var(--ds-panel-strong))',
        borderColor: 'color-mix(in srgb, var(--ds-accent-coral) 28%, transparent)',
        boxShadow: '0 14px 32px color-mix(in srgb, var(--ds-accent-coral) 18%, transparent)',
    },
    gold: {
        color: 'var(--ds-accent-gold)',
        background: 'color-mix(in srgb, var(--ds-accent-gold) 18%, var(--ds-panel-strong))',
        borderColor: 'color-mix(in srgb, var(--ds-accent-gold) 32%, transparent)',
        boxShadow: '0 14px 32px color-mix(in srgb, var(--ds-accent-gold) 16%, transparent)',
    },
    violet: {
        color: 'var(--ds-accent-violet)',
        background: 'color-mix(in srgb, var(--ds-accent-violet) 16%, var(--ds-panel-strong))',
        borderColor: 'color-mix(in srgb, var(--ds-accent-violet) 28%, transparent)',
        boxShadow: '0 14px 32px color-mix(in srgb, var(--ds-accent-violet) 16%, transparent)',
    },
}

export function InstallLabIcon(props: {
    iconNode: LabIconNode
    tone: InstallTone
    iconClassName?: string
    compact?: boolean
}): JSX.Element {
    return (
        <span
            className={cn('ds-install-lab-icon', props.compact ? 'ds-install-lab-icon-compact' : null)}
            style={INSTALL_ICON_TONES[props.tone]}
        >
            <Icon iconNode={props.iconNode as never} className={cn('h-5 w-5', props.iconClassName)} strokeWidth={2.1} />
        </span>
    )
}
