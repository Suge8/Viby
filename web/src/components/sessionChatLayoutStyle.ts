import type { CSSProperties } from 'react'

export type SessionChatLayoutStyle = CSSProperties & Record<
    '--chat-composer-offset-bottom' | '--chat-composer-reserved-space' | '--chat-floating-control-offset-bottom',
    string
>

export function buildSessionChatLayoutStyle(options: {
    composerHeight: number
    bottomInsetPx: number
    floatingControlBottomInsetPx: number
}): SessionChatLayoutStyle {
    return {
        '--chat-composer-offset-bottom': `${options.bottomInsetPx}px`,
        '--chat-composer-reserved-space': `${Math.max(options.composerHeight, 0)}px`,
        '--chat-floating-control-offset-bottom': `${options.floatingControlBottomInsetPx}px`
    }
}
