export type InteractiveCardStyleMode = 'disclosure-trigger' | 'full-card' | 'stacked-full-card' | 'section-trigger'

const INTERACTIVE_CARD_CLASS_NAME_BY_MODE: Record<InteractiveCardStyleMode, string> = {
    'disclosure-trigger':
        'w-full min-h-0 items-center justify-between text-left text-[var(--app-fg)] transition-[background-color,border-color,color] hover:bg-[var(--app-subtle-bg)] focus-visible:ring-[var(--app-link)] [&>[data-button-content]]:w-full [&>[data-button-content]]:items-center [&>[data-button-content]]:justify-between',
    'full-card':
        'w-full text-left [&>[data-button-content]]:w-full [&>[data-button-content]]:items-start [&>[data-button-content]]:justify-start',
    'stacked-full-card':
        'w-full text-left [&>[data-button-content]]:w-full [&>[data-button-content]]:flex-col [&>[data-button-content]]:items-stretch',
    'section-trigger':
        'ds-interactive-card-inherit-radius w-full min-h-0 items-start justify-start px-3 py-3 text-left text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:ring-[var(--app-link)] [&>[data-button-content]]:w-full [&>[data-button-content]]:items-start [&>[data-button-content]]:justify-start',
}

export function getInteractiveCardClassName(mode: InteractiveCardStyleMode): string {
    return INTERACTIVE_CARD_CLASS_NAME_BY_MODE[mode]
}
