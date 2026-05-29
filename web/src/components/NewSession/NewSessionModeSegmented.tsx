import { LayoutGroup, m } from 'motion/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import type { NewSessionMode } from './newSessionModes'

const PILL_TRANSITION = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.7 }

const NEW_SESSION_MODE_SEGMENTED_CONTAINER_CLASS_NAME =
    'grid w-full grid-cols-2 gap-1 rounded-[var(--ds-radius-lg)] border border-[var(--app-divider)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-1 shadow-[var(--ds-shadow-soft)]'

const SEGMENTED_TAB_BASE_CLASS_NAME =
    'h-full w-full gap-2 rounded-[var(--ds-radius-md)] bg-transparent px-3 py-2 text-sm font-medium hover:bg-transparent'

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
        <LayoutGroup id="new-session-mode">
            <div
                role="tablist"
                aria-label={t('newSession.title')}
                className={NEW_SESSION_MODE_SEGMENTED_CONTAINER_CLASS_NAME}
            >
                {options.map((option) => {
                    const active = props.mode === option.value
                    const labelTextClassName = active ? 'text-[var(--ds-text-primary)]' : 'text-[var(--app-hint)]'
                    return (
                        <div key={option.value} className="relative isolate">
                            {active ? (
                                <m.span
                                    layoutId="new-session-mode-pill"
                                    transition={PILL_TRANSITION}
                                    className="absolute inset-0 -z-10 rounded-[var(--ds-radius-md)] bg-[var(--ds-canvas)] shadow-[var(--ds-shadow-soft)]"
                                />
                            ) : null}
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                pressStyle="segmented"
                                role="tab"
                                aria-selected={active}
                                disabled={props.isDisabled}
                                onClick={() => props.onModeChange(option.value)}
                                className={`${SEGMENTED_TAB_BASE_CLASS_NAME} ${labelTextClassName}`}
                            >
                                {option.label}
                            </Button>
                        </div>
                    )
                })}
            </div>
        </LayoutGroup>
    )
}
