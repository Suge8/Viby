import type { JSX } from 'react'
import { SettingsIcon, BrandMarkIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const HEADER_ACTION_BUTTON_CLASS_NAME = 'h-11 w-11 text-[var(--app-hint)] hover:text-[var(--app-fg)]'
const BRAND_TITLE_FRAME_CLASS_NAME = 'pointer-events-none absolute inset-0 flex items-center justify-center px-[4.75rem]'
const BRAND_TITLE_CLASS_NAME = 'inline-flex items-center justify-center text-center text-[1.72rem] leading-none font-[800] tracking-[-0.018em] [font-family:var(--ds-font-brand)] text-[color:color-mix(in_srgb,var(--ds-text-primary)_96%,white_4%)]'

type SessionsHeaderActionButtonProps = {
    title: string
    onClick: () => void
    className?: string
    children: JSX.Element
}

type SessionsShellHeaderProps = {
    settingsTitle: string
    onOpenSettings: () => void
}

function SessionsHeaderActionButton(props: SessionsHeaderActionButtonProps): JSX.Element {
    return (
        <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={props.onClick}
            className={cn(HEADER_ACTION_BUTTON_CLASS_NAME, props.className)}
            title={props.title}
        >
            {props.children}
        </Button>
    )
}

export function SessionsShellHeader(props: SessionsShellHeaderProps): JSX.Element {
    return (
        <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
            <div className="mx-auto w-full max-w-content px-3 pb-3 pt-4">
                <div className="relative min-h-[3rem]">
                    <div className={BRAND_TITLE_FRAME_CLASS_NAME}>
                        <span className={BRAND_TITLE_CLASS_NAME}>
                            Viby
                        </span>
                    </div>
                    <div className="relative z-10 flex min-h-[3rem] items-center justify-between gap-3">
                        <BrandMarkIcon className="h-11 w-11 text-[color:color-mix(in_srgb,var(--ds-text-primary)_94%,white_6%)]" />
                        <SessionsHeaderActionButton
                            title={props.settingsTitle}
                            onClick={props.onOpenSettings}
                        >
                            <SettingsIcon className="h-5 w-5 text-[var(--ds-accent-coral)]" />
                        </SessionsHeaderActionButton>
                    </div>
                </div>
            </div>
        </div>
    )
}
