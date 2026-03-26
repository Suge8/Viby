const MESSAGE_WINDOW_WARNING_KEYS = [
    'chat.messagesWarning.pendingOverflow',
    'chat.messagesWarning.loadFailed'
] as const

export const MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY = 'chat.messagesWarning.pendingOverflow'
export const MESSAGE_WINDOW_LOAD_FAILED_WARNING_KEY = 'chat.messagesWarning.loadFailed'
export type MessageWindowWarningKey = (typeof MESSAGE_WINDOW_WARNING_KEYS)[number]

export function isMessageWindowWarningKey(value: string): value is MessageWindowWarningKey {
    return (MESSAGE_WINDOW_WARNING_KEYS as readonly string[]).includes(value)
}
