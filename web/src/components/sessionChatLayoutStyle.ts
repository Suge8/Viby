import type { CSSProperties } from 'react'

export type SessionChatLayoutStyle = CSSProperties & Record<
    '--chat-composer-offset-bottom' | '--chat-composer-reserved-space',
    string
>

export function buildSessionChatLayoutStyle(options: {
    composerHeight: number
    bottomInsetPx: number
}): SessionChatLayoutStyle {
    return {
        '--chat-composer-offset-bottom': `${options.bottomInsetPx}px`,
        '--chat-composer-reserved-space': `${Math.max(options.composerHeight, 0)}px`
    }
}
