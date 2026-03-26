import {
    BrandMarkIcon,
} from '@/components/icons'
import {
    FeatureBulbIcon as BulbIcon,
    FeatureRocketIcon as RocketIcon,
} from '@/components/featureIcons'
import {
    PressableSurface,
    PressableSurfaceSelectionIndicator
} from '@/components/ui/pressable-surface'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import type { SessionRole } from './types'

const SESSION_ROLE_OPTIONS: Array<{
    value: SessionRole
    accentClassName: string
    icon: React.JSX.Element
}> = [
    {
        value: 'normal',
        accentClassName: 'text-[var(--ds-accent-gold)]',
        icon: <BulbIcon className="h-4.5 w-4.5" />
    },
    {
        value: 'manager',
        accentClassName: 'text-[var(--ds-accent-lime)]',
        icon: <RocketIcon className="h-4.5 w-4.5" />
    }
]

export function SessionRolePicker(props: {
    sessionRole: SessionRole
    isDisabled: boolean
    onSessionRoleChange: (sessionRole: SessionRole) => void
}): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-text-muted)]">
                <span className="flex h-5 w-5 items-center justify-center">
                    <BrandMarkIcon className="h-3.5 w-3.5 text-[var(--ds-brand)]" />
                </span>
                <span>{t('newSession.role')}</span>
            </div>
            <div role="radiogroup" aria-label={t('newSession.role')} className="grid gap-2">
                {SESSION_ROLE_OPTIONS.map((option) => {
                    const checked = props.sessionRole === option.value
                    return (
                        <PressableSurface
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            selected={checked}
                            density="compact"
                            disabled={props.isDisabled}
                            className={cn(
                                'items-start gap-3',
                                checked ? 'ring-1 ring-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)]' : ''
                            )}
                            onClick={() => props.onSessionRoleChange(option.value)}
                        >
                            <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)]', option.accentClassName)}>
                                {option.icon}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                                <span className="flex items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                                        {t(`newSession.role.${option.value}`)}
                                    </span>
                                    <PressableSurfaceSelectionIndicator selected={checked} />
                                </span>
                                <span className="text-xs text-[var(--ds-text-muted)]">
                                    {t(`newSession.role.${option.value}.desc`)}
                                </span>
                            </span>
                        </PressableSurface>
                    )
                })}
            </div>
        </div>
    )
}
