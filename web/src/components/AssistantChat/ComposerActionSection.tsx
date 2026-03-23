import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type ComposerActionItem = {
    key: string
    label: string
    description?: string
    icon: ReactNode
    disabled: boolean
    onSelect: () => void
}

type ComposerActionSectionProps = {
    title: string
    items: ComposerActionItem[]
}

const COMPOSER_ACTION_BUTTON_CLASS_NAME =
    'w-full gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-start'

export function ComposerActionSection(props: ComposerActionSectionProps): ReactNode {
    return (
        <section className="px-3 py-2">
            <div className="px-1 pb-1.5 text-xs font-medium text-[var(--app-hint)]">
                {props.title}
            </div>
            <div className="overflow-hidden">
                {props.items.map((item, index) => (
                    <Button
                        key={item.key}
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={item.disabled}
                        className={`${COMPOSER_ACTION_BUTTON_CLASS_NAME} ${
                            index > 0 ? 'mt-1' : ''
                        } ${
                            item.disabled
                                ? 'cursor-not-allowed opacity-50'
                                : 'hover:bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)]'
                        }`}
                        onClick={item.onSelect}
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-panel)_96%,transparent)] text-[var(--app-fg)]">
                            {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-[var(--app-fg)]">
                                {item.label}
                            </span>
                            {item.description ? (
                                <span className="mt-0.5 block text-[11px] text-[var(--app-hint)]">
                                    {item.description}
                                </span>
                            ) : null}
                        </span>
                    </Button>
                ))}
            </div>
        </section>
    )
}
