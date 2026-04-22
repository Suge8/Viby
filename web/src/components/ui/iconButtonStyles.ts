export const ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME =
    'border-[color:color-mix(in_srgb,var(--ds-border-default)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel)_96%,transparent)] text-[var(--app-hint)] shadow-[0_6px_18px_rgba(9,15,35,0.06)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-panel-strong)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50'

export const ICON_ONLY_BUTTON_FLOATING_SURFACE_CLASS_NAME = `${ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME} shadow-[var(--ds-shadow-soft)] backdrop-blur-sm`

export const ICON_ONLY_BUTTON_CONTEXTUAL_CLASS_NAME =
    'rounded-full border p-1 text-[var(--app-hint)] transition-colors data-[copied=true]:border-[color:color-mix(in_srgb,var(--ds-success)_44%,transparent)] data-[copied=true]:text-[var(--ds-success)] ' +
    ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME

export const ICON_ONLY_BUTTON_FLOATING_CONTEXTUAL_CLASS_NAME =
    'rounded-full border p-1 text-[var(--app-hint)] shadow-[0_8px_18px_rgba(9,15,35,0.08)] backdrop-blur-sm transition-colors hover:text-[var(--app-fg)] data-[copied=true]:border-[color:color-mix(in_srgb,var(--ds-success)_44%,transparent)] data-[copied=true]:text-[var(--ds-success)] ' +
    ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME
