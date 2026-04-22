import type { CSSProperties } from 'react'
import type { ElementFrame } from '@/hooks/useElementFrame'

export type SessionChatLayoutStyle = CSSProperties &
    Partial<
        Record<
            | '--chat-composer-offset-bottom'
            | '--chat-composer-reserved-space'
            | '--chat-floating-control-offset-bottom'
            | '--chat-composer-stage-top'
            | '--chat-desktop-stage-center-x',
            string
        >
    >

export type SessionChatPageStyle = CSSProperties & Partial<Record<'--ds-session-chat-header-clearance', string>>

export function buildSessionChatLayoutStyle(options: {
    composerFrame: ElementFrame | null
    composerHeight: number
    bottomInsetPx: number
    floatingControlBottomInsetPx: number
}): SessionChatLayoutStyle {
    return {
        '--chat-composer-offset-bottom': `${options.bottomInsetPx}px`,
        '--chat-composer-reserved-space': `${Math.max(options.composerHeight, 0)}px`,
        '--chat-floating-control-offset-bottom': `${options.floatingControlBottomInsetPx}px`,
        ...(options.composerFrame
            ? {
                  '--chat-composer-stage-top': `${options.composerFrame.top}px`,
                  '--chat-desktop-stage-center-x': `${Math.round(
                      options.composerFrame.left + options.composerFrame.width / 2
                  )}px`,
              }
            : {}),
    }
}

export function buildSessionChatPageStyle(options: { headerHeight: number }): SessionChatPageStyle {
    if (options.headerHeight <= 0) {
        return {}
    }

    return {
        '--ds-session-chat-header-clearance': `${Math.max(options.headerHeight, 0)}px`,
    }
}
