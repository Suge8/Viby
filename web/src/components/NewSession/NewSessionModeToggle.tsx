import { PressableSurface, PressableSurfaceSelectionIndicator } from '@/components/ui/pressable-surface'
import { useTranslation } from '@/lib/use-translation'
import type { NewSessionMode } from './newSessionModes'

export function NewSessionModeToggle(props: {
    mode: NewSessionMode
    isDisabled: boolean
    onModeChange: (mode: NewSessionMode) => void
}) {
    const { t } = useTranslation()
    const options: ReadonlyArray<{
        value: NewSessionMode
        title: string
        description: string
    }> = [
        {
            value: 'start',
            title: t('newSession.mode.start'),
            description: t('newSession.mode.start.desc'),
        },
        {
            value: 'recover-local',
            title: t('newSession.mode.recover'),
            description: t('newSession.mode.recover.desc'),
        },
    ]

    return (
        <div role="radiogroup" aria-label={t('newSession.title')} className="grid gap-2 md:grid-cols-2">
            {options.map((option) => {
                const checked = props.mode === option.value

                return (
                    <PressableSurface
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        selected={checked}
                        disabled={props.isDisabled}
                        className="items-start gap-3 rounded-3xl px-4 py-3.5"
                        onClick={() => props.onModeChange(option.value)}
                    >
                        <span className="min-w-0 flex-1 text-left">
                            <span className="block text-sm font-semibold text-[var(--ds-text-primary)]">
                                {option.title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-[var(--ds-text-secondary)]">
                                {option.description}
                            </span>
                        </span>
                        <PressableSurfaceSelectionIndicator selected={checked} className="mt-0.5" />
                    </PressableSurface>
                )
            })}
        </div>
    )
}
