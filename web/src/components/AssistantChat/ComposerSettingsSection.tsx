import type { ReactNode } from 'react'
import {
    COMPOSER_CONTROL_OPTION_BUTTON_CLASS_NAME,
    getComposerOptionLabel,
    getSelectedComposerOption,
} from '@/components/AssistantChat/composerControlPresentation'
import { FeatureCheckIcon as CheckIcon } from '@/components/featureIcons'
import { Button } from '@/components/ui/button'
import { DisclosureCardSection, DisclosureCardSummary } from '@/components/ui/DisclosureCardSection'
import { getInteractiveCardClassName } from '@/components/ui/interactiveCardStyles'
import type { ComposerPanelOption } from '@/lib/sessionConfigPresentation'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'

type ComposerSettingsSectionProps<T extends string | null> = {
    icon: ReactNode
    testId?: string
    title: string
    summary: string
    options: readonly ComposerPanelOption<T>[]
    selectedValue: T
    disabled: boolean
    onSelect: (value: T) => void
}

export function ComposerSettingsSection<T extends string | null>(props: ComposerSettingsSectionProps<T>) {
    const { t } = useTranslation()
    const selectedOption = getSelectedComposerOption(props.options, props.selectedValue)
    const selectedDescription = selectedOption?.description

    return (
        <div data-testid={props.testId}>
            <DisclosureCardSection
                disabled={props.disabled}
                triggerContent={<DisclosureCardSummary icon={props.icon} title={props.title} summary={props.summary} />}
                panelClassName="px-0.5 pt-1"
                panelInnerClassName="space-y-1"
            >
                {selectedDescription && props.options.length <= 2 ? (
                    <p className="px-1.5 text-xs leading-5 text-[var(--app-hint)]">{selectedDescription}</p>
                ) : null}

                <div className="space-y-1">
                    {props.options.map((option) => {
                        const isSelected = props.selectedValue === option.value
                        const label = getComposerOptionLabel(option, t)

                        return (
                            <Button
                                key={option.value ?? 'default'}
                                type="button"
                                variant="plain"
                                size="sm"
                                disabled={props.disabled}
                                className={cn(
                                    getInteractiveCardClassName('disclosure-trigger'),
                                    COMPOSER_CONTROL_OPTION_BUTTON_CLASS_NAME,
                                    props.disabled ? 'cursor-not-allowed opacity-50' : '',
                                    isSelected
                                        ? 'border-[color:color-mix(in_srgb,var(--ds-brand)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,var(--ds-panel-strong))] text-[var(--ds-brand)]'
                                        : 'text-[var(--app-fg)]'
                                )}
                                onClick={() => props.onSelect(option.value)}
                                onMouseDown={(event) => event.preventDefault()}
                            >
                                <span className="min-w-0 truncate text-sm font-medium">{label}</span>
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                                    {isSelected ? <CheckIcon className="h-4 w-4" /> : null}
                                </span>
                            </Button>
                        )
                    })}
                </div>
            </DisclosureCardSection>
        </div>
    )
}
