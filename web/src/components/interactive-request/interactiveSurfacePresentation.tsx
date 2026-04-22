import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'
import type { InteractiveSurfaceFrame } from './useInteractiveSurfaceFrame'

const DESKTOP_MODAL_PADDING_CLASS_NAME = 'px-4 pb-4 pt-10 sm:px-6'
const MOBILE_MODAL_PADDING_CLASS_NAME = 'px-0 pb-0 pt-12'
const DESKTOP_MODAL_PANEL_CLASS_NAME =
    'pointer-events-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-[var(--ds-radius-2xl)] border border-[var(--app-border)] bg-[var(--app-bg)] shadow-[var(--app-session-selected-shadow)]'
const MOBILE_MODAL_PANEL_CLASS_NAME =
    'pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-[var(--ds-radius-2xl)] border border-b-0 border-[var(--app-border)] bg-[var(--app-bg)] shadow-[var(--app-session-selected-shadow)]'
const ACTION_BAR_PANEL_CLASS_NAME =
    'pointer-events-auto w-full rounded-[var(--ds-radius-2xl)] border border-[var(--app-border)] bg-[var(--app-bg)] shadow-[var(--app-session-selected-shadow)]'
const MOBILE_SHEET_MAX_HEIGHT = 'min(80dvh, 100%)'
const MOBILE_ACTION_BAR_GAP_PX = 12

type InteractiveSurfaceLayout = 'desktop' | 'mobile'

type InteractiveSurfaceShell = {
    frame: InteractiveSurfaceFrame | null
    layout: InteractiveSurfaceLayout
    testId: string
}

type InteractiveSurfaceHeader = {
    badgeLabel: string
    description: string
    status?: ReactNode
}

type InteractiveSurfacePresentationProps = {
    shell: InteractiveSurfaceShell
    header: InteractiveSurfaceHeader
    children: ReactNode
}

type PlanExecutionSurfaceProps = {
    shell: InteractiveSurfaceShell
    composerHeight: number
    label: string
    children: ReactNode
}

function buildFixedFrameStyle(frame: InteractiveSurfaceFrame): CSSProperties {
    return {
        left: `${frame.left}px`,
        top: `${frame.top}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
    }
}

function renderMobileSheetHandle(): React.JSX.Element {
    return <div className="mx-auto mb-3 mt-1 h-1.5 w-10 rounded-full bg-[var(--app-border)]" aria-hidden="true" />
}

export function InteractiveSurfacePresentation(props: InteractiveSurfacePresentationProps): React.JSX.Element | null {
    const overlayRoot = ensureAppOverlayRoot()
    if (!overlayRoot || !props.shell.frame) {
        return null
    }

    const shellPaddingClassName =
        props.shell.layout === 'desktop' ? DESKTOP_MODAL_PADDING_CLASS_NAME : MOBILE_MODAL_PADDING_CLASS_NAME
    const panelClassName =
        props.shell.layout === 'desktop' ? DESKTOP_MODAL_PANEL_CLASS_NAME : MOBILE_MODAL_PANEL_CLASS_NAME

    return createPortal(
        <div className="pointer-events-none fixed z-40" style={buildFixedFrameStyle(props.shell.frame)}>
            <div
                className={`relative flex h-full w-full overflow-hidden ${
                    props.shell.layout === 'desktop' ? 'items-start justify-center' : 'items-end justify-center'
                } ${shellPaddingClassName}`}
            >
                <div className="pointer-events-auto absolute inset-0 bg-black/10" aria-hidden="true" />
                <section
                    className={panelClassName}
                    data-testid={props.shell.testId}
                    aria-live="polite"
                    role="dialog"
                    style={props.shell.layout === 'mobile' ? { maxHeight: MOBILE_SHEET_MAX_HEIGHT } : undefined}
                >
                    {props.shell.layout === 'mobile' ? renderMobileSheetHandle() : null}
                    <header className="flex items-start justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <Badge variant="default">{props.header.badgeLabel}</Badge>
                                {props.header.status}
                            </div>
                            <p className="mt-2 text-sm text-[var(--app-hint)]">{props.header.description}</p>
                        </div>
                    </header>
                    <div className="min-h-0 flex-1 px-4 py-4 sm:px-5">{props.children}</div>
                </section>
            </div>
        </div>,
        overlayRoot
    )
}

export function PlanExecutionSurface(props: PlanExecutionSurfaceProps): React.JSX.Element | null {
    const overlayRoot = ensureAppOverlayRoot()
    if (!overlayRoot || !props.shell.frame) {
        return null
    }

    const shellStyle =
        props.shell.layout === 'mobile'
            ? { padding: '12px', paddingBottom: `${props.composerHeight + MOBILE_ACTION_BAR_GAP_PX}px` }
            : { padding: '16px' }

    return createPortal(
        <div className="pointer-events-none fixed z-30" style={buildFixedFrameStyle(props.shell.frame)}>
            <div
                className={`flex h-full w-full justify-center ${
                    props.shell.layout === 'desktop' ? 'items-start' : 'items-end'
                }`}
                style={shellStyle}
            >
                <section
                    className={ACTION_BAR_PANEL_CLASS_NAME}
                    data-testid={props.shell.testId}
                    aria-live="polite"
                    role="region"
                    aria-label={props.label}
                >
                    {props.children}
                </section>
            </div>
        </div>,
        overlayRoot
    )
}
