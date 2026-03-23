import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type SessionRouteTabItem = {
    id: string
    label: string
}

type SessionRouteTabsProps = {
    activeId: string
    items: SessionRouteTabItem[]
    onChange: (id: string) => void
}

export function SessionRouteTabs(props: SessionRouteTabsProps): ReactNode {
    return (
        <div className="bg-[var(--app-bg)] border-b border-[var(--app-divider)]" role="tablist">
            <div
                className="mx-auto grid w-full ds-stage-shell"
                style={{ gridTemplateColumns: `repeat(${props.items.length}, minmax(0, 1fr))` }}
            >
                {props.items.map((item) => {
                    const active = item.id === props.activeId
                    return (
                        <Button
                            key={item.id}
                            type="button"
                            variant="plain"
                            size="sm"
                            role="tab"
                            aria-selected={active}
                            onClick={() => props.onChange(item.id)}
                            className={`relative rounded-none py-3 text-center text-sm font-semibold hover:bg-[var(--app-subtle-bg)] ${active ? 'text-[var(--app-fg)]' : 'text-[var(--app-hint)]'}`}
                        >
                            {item.label}
                            <span
                                className={`absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full ${active ? 'bg-[var(--app-link)]' : 'bg-transparent'}`}
                            />
                        </Button>
                    )
                })}
            </div>
        </div>
    )
}
