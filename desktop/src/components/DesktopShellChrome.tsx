import { getCurrentWindow } from '@tauri-apps/api/window'
import type { JSX, MouseEvent, ReactNode } from 'react'

export function BrandMark(): JSX.Element {
    return (
        <div className="desktop-brand" aria-label="Viby">
            <img alt="" src="/brand-logo-tight.png" />
            <span>Viby</span>
        </div>
    )
}

export function NavButton(props: {
    active: boolean
    children: ReactNode
    icon: ReactNode
    onClick(): void
}): JSX.Element {
    return (
        <button type="button" className={`desktop-nav-link ${props.active ? 'is-active' : ''}`} onClick={props.onClick}>
            <span className="desktop-nav-link-icon" aria-hidden="true">
                {props.icon}
            </span>
            <span>{props.children}</span>
        </button>
    )
}

export function WindowDragRegion(): JSX.Element {
    const handleMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
        if (event.button !== 0) return
        void getCurrentWindow()
            .startDragging()
            .catch(() => undefined)
    }

    return <div className="desktop-window-drag-region" data-tauri-drag-region onMouseDown={handleMouseDown} />
}
