import type { CSSProperties } from 'react'
import {
    copyText,
    gemRing,
    tabText,
} from '@lucide/lab'
import { BellRing, Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

type LabIconNode = ReadonlyArray<readonly [string, Record<string, string>]>
type SettingsTone = 'coral' | 'gold' | 'violet'

const TONE_STYLES: Record<SettingsTone, CSSProperties> = {
    coral: { color: 'var(--ds-accent-coral)' },
    gold: { color: 'var(--ds-accent-gold)' },
    violet: { color: 'var(--ds-accent-violet)' },
}

function SettingsIcon(props: {
    iconNode: LabIconNode
    tone: SettingsTone
    className?: string
    iconClassName?: string
}): React.JSX.Element {
    return (
        <span
            className={cn('inline-flex items-center justify-center', props.className)}
            style={TONE_STYLES[props.tone]}
        >
            <Icon iconNode={props.iconNode as never} className={cn('h-[18px] w-[18px]', props.iconClassName)} strokeWidth={2.1} />
        </span>
    )
}

export function LanguageSettingsIcon(props: { className?: string }): React.JSX.Element {
    return <SettingsIcon iconNode={copyText} tone="violet" className={props.className} />
}

export function AppearanceSettingsIcon(props: { className?: string }): React.JSX.Element {
    return <SettingsIcon iconNode={gemRing} tone="coral" className={props.className} />
}

export function AppVersionSettingsIcon(props: { className?: string }): React.JSX.Element {
    return <SettingsIcon iconNode={tabText} tone="gold" className={props.className} />
}

export function NotificationSettingsIcon(props: { className?: string }): React.JSX.Element {
    return <BellRing className={cn('h-[18px] w-[18px]', props.className)} style={TONE_STYLES.gold} strokeWidth={2.1} />
}
