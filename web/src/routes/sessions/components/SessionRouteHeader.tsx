import type { ReactNode } from 'react'
import { BackIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

type SessionRouteHeaderProps = {
    title: string
    subtitle: string
    onBack: () => void
    actions?: ReactNode
}

export function SessionRouteHeader(props: SessionRouteHeaderProps): ReactNode {
    return (
        <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex w-full ds-stage-shell items-center gap-2 border-b border-[var(--app-border)] p-3">
                <Button
                    type="button"
                    size="iconSm"
                    variant="secondary"
                    onClick={props.onBack}
                    className="h-10 w-10 text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                >
                    <BackIcon className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{props.title}</div>
                    <div className="truncate text-xs text-[var(--app-hint)]">{props.subtitle}</div>
                </div>
                {props.actions ?? null}
            </div>
        </div>
    )
}
