import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import type { NewSessionMode } from './newSessionModes'

const NEW_SESSION_MODE_SEGMENTED_CONTAINER_CLASS_NAME =
    'grid w-full grid-cols-2 gap-1 rounded-[var(--ds-radius-lg)] border border-[var(--app-divider)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-1 shadow-[var(--ds-shadow-soft)]'

function getNewSessionModeSegmentedTabClassName(active: boolean): string {
    if (active) {
        return 'h-full w-full gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-canvas)] px-3 py-2 text-sm font-medium text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)]'
    }
    return 'h-full w-full gap-2 rounded-[var(--ds-radius-md)] px-3 py-2 text-sm font-medium text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]'
}

type NewSessionModeOption = {
    value: NewSessionMode
    label: string
}

type NewSessionModeSegmentedProps = {
    mode: NewSessionMode
    isDisabled: boolean
    onModeChange: (mode: NewSessionMode) => void
}

export function NewSessionModeSegmented(props: NewSessionModeSegmentedProps): React.JSX.Element {
    const { t } = useTranslation()
    const options: ReadonlyArray<NewSessionModeOption> = [
        { value: 'start', label: t('newSession.mode.start') },
        { value: 'recover-local', label: t('newSession.mode.recover') },
    ]

    return (
        <div
            role="tablist"
            aria-label={t('newSession.title')}
            className={NEW_SESSION_MODE_SEGMENTED_CONTAINER_CLASS_NAME}
        >
            {options.map((option) => {
                const active = props.mode === option.value
                return (
                    <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={active ? 'secondary' : 'ghost'}
                        pressStyle="segmented"
                        role="tab"
                        aria-selected={active}
                        disabled={props.isDisabled}
                        onClick={() => props.onModeChange(option.value)}
                        className={getNewSessionModeSegmentedTabClassName(active)}
                    >
                        {option.label}
                    </Button>
                )
            })}
        </div>
    )
}
