import { CheckIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { ComposerOptionTone, ComposerPanelOption } from '@/lib/sessionConfigPresentation'
import { useTranslation } from '@/lib/use-translation'

type ComposerSettingsSectionProps<T extends string | null> = {
    title: string
    description?: string
    options: ComposerPanelOption<T>[]
    selectedValue: T
    disabled: boolean
    onSelect: (value: T) => void
}

const OPTION_TONE_CLASS_NAME: Record<ComposerOptionTone, string> = {
    neutral: 'text-[var(--app-fg)]',
    brand: 'text-[var(--app-fg)]',
    warning: 'text-[var(--app-fg)]',
    danger: 'text-[var(--app-fg)]',
}

const COMPOSER_SETTINGS_BUTTON_CLASS_NAME =
    'w-full gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors [&>[data-button-content]]:w-full [&>[data-button-content]]:items-start [&>[data-button-content]]:justify-between'

export function ComposerSettingsSection<T extends string | null>(props: ComposerSettingsSectionProps<T>) {
    const { t } = useTranslation()

    return (
        <section className="px-3 py-2">
            <div className="px-1 pb-1.5">
                <div className="text-xs font-medium text-[var(--app-hint)]">
                    {props.title}
                </div>
                {props.description && props.options.length <= 2 ? (
                    <p className="mt-1 text-[11px] leading-5 text-[var(--app-hint)]">
                        {props.description}
                    </p>
                ) : null}
            </div>
            <div className="overflow-hidden">
                {props.options.map((option, index) => {
                    const isSelected = props.selectedValue === option.value
                    const toneClassName = OPTION_TONE_CLASS_NAME[option.tone ?? 'neutral']

                    return (
                        <Button
                            key={option.value ?? 'default'}
                            type="button"
                            variant={isSelected ? 'secondary' : 'ghost'}
                            size="sm"
                            disabled={props.disabled}
                            className={`${COMPOSER_SETTINGS_BUTTON_CLASS_NAME} ${
                                index > 0 ? 'mt-1' : ''
                            } ${
                                props.disabled
                                    ? 'cursor-not-allowed opacity-50'
                                    : 'hover:bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)]'
                            } ${
                                isSelected
                                    ? 'bg-[color:color-mix(in_srgb,var(--ds-brand)_8%,var(--ds-panel-strong))]'
                                    : ''
                            } ${toneClassName}`}
                            onClick={() => props.onSelect(option.value)}
                            onMouseDown={(event) => event.preventDefault()}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${isSelected ? 'text-[var(--ds-brand)]' : ''}`}>
                                        {option.labelKey ? t(option.labelKey) : option.label}
                                    </span>
                                </div>
                                {isSelected && option.description ? (
                                    <p className="mt-1 text-[11px] leading-5 text-[var(--app-hint)]">
                                        {option.description}
                                    </p>
                                ) : null}
                            </div>
                            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[var(--ds-brand)]">
                                {isSelected ? <CheckIcon className="h-4 w-4" /> : null}
                            </div>
                        </Button>
                    )
                })}
            </div>
        </section>
    )
}
