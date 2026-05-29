import type { CSSProperties } from 'react'
import type { ElementFrame } from '@/hooks/useElementFrame'

/* Composer-geometry vars live on :root so portal-rendered overlays
   (RemotePairingLinkBadge) can align with the in-tree composer/outline
   controls. The static :root defaults are declared in
   design-system-composer.css; this builder is the single owner of the
   write+cleanup loop on document.documentElement.style — it always
   returns the full schema so the chat workspace effect can use
   `Object.keys(vars)` for cleanup without a parallel name list. */
export type SessionChatLayoutCssVarName =
    | '--chat-composer-offset-bottom'
    | '--chat-composer-reserved-space'
    | '--chat-composer-stage-top'
    | '--chat-desktop-stage-center-x'

export type SessionChatLayoutCssVars = Record<SessionChatLayoutCssVarName, string>

export type SessionChatPageStyle = CSSProperties &
    Partial<
        Record<
            | '--ds-session-chat-header-clearance'
            | '--chat-desktop-header-stage-right-x'
            | '--chat-desktop-header-stage-content-right-x',
            string
        >
    >

/* Fallbacks mirror the :root defaults in design-system-composer.css so
   a missing composer frame still resolves the badge anchors and the
   outline trigger position to the same values as the unmounted state. */
const MISSING_COMPOSER_STAGE_TOP = '100vh'
const MISSING_COMPOSER_STAGE_CENTER_X = '50vw'

export function buildSessionChatLayoutCssVars(options: {
    composerFrame: ElementFrame | null
    composerHeight: number
    bottomInsetPx: number
}): SessionChatLayoutCssVars {
    const frame = options.composerFrame
    return {
        '--chat-composer-offset-bottom': `${options.bottomInsetPx}px`,
        '--chat-composer-reserved-space': `${Math.max(options.composerHeight, 0)}px`,
        '--chat-composer-stage-top': frame ? `${frame.top}px` : MISSING_COMPOSER_STAGE_TOP,
        '--chat-desktop-stage-center-x': frame
            ? `${Math.round(frame.left + frame.width / 2)}px`
            : MISSING_COMPOSER_STAGE_CENTER_X,
    }
}

const SESSION_HEADER_STAGE_PADDING_PX = 12

export function buildSessionChatPageStyle(options: {
    headerHeight: number
    headerStageContentFrame: ElementFrame | null
}): SessionChatPageStyle {
    const style: SessionChatPageStyle = {}

    if (options.headerHeight > 0) {
        style['--ds-session-chat-header-clearance'] = `${Math.max(options.headerHeight, 0)}px`
    }

    if (options.headerStageContentFrame) {
        const stageRight = Math.round(options.headerStageContentFrame.left + options.headerStageContentFrame.width)
        style['--chat-desktop-header-stage-right-x'] = `${stageRight}px`
        // SessionHeader's inner stage shell carries `px-3` (0.75rem = 12px) padding,
        // so the more button's right edge sits one padding-step left of the stage
        // shell rect right edge.
        style['--chat-desktop-header-stage-content-right-x'] = `${stageRight - SESSION_HEADER_STAGE_PADDING_PX}px`
    }

    return style
}
