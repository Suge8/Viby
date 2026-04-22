import type { ComposerPanelOption } from '@/lib/sessionConfigPresentation'

export const COMPOSER_CONTROL_OPTION_BUTTON_CLASS_NAME =
    'min-h-0 gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--ds-border-default)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel)_94%,transparent)] px-2.5 py-1.5 shadow-none hover:border-[var(--ds-border-strong)]'

type Translate = (key: string, params?: Record<string, string | number>) => string

export function getComposerOptionLabel<T extends string | null>(option: ComposerPanelOption<T>, t: Translate): string {
    return option.labelKey ? t(option.labelKey) : option.label
}

export function getSelectedComposerOption<T extends string | null>(
    options: readonly ComposerPanelOption<T>[],
    selectedValue: T
): ComposerPanelOption<T> | undefined {
    return (
        options.find((option) => option.value === selectedValue) ??
        options.find((option) => option.value === null) ??
        options[0]
    )
}

export function getSelectedComposerOptionLabel<T extends string | null>(
    options: readonly ComposerPanelOption<T>[],
    selectedValue: T,
    t: Translate
): string {
    const selectedOption = getSelectedComposerOption(options, selectedValue)
    return selectedOption ? getComposerOptionLabel(selectedOption, t) : ''
}
