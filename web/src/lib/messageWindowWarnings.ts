const MESSAGE_WINDOW_WARNING_KEYS = [
    'chat.messagesWarning.pendingOverflow',
    'chat.messagesWarning.loadFailed',
    'chat.messagesWarning.postSwitchSendFailed',
] as const

const POST_SWITCH_MESSAGE_WINDOW_WARNING_KEYS = ['chat.messagesWarning.postSwitchSendFailed'] as const

export const MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY = 'chat.messagesWarning.pendingOverflow'
export const MESSAGE_WINDOW_LOAD_FAILED_WARNING_KEY = 'chat.messagesWarning.loadFailed'
export const MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY = 'chat.messagesWarning.postSwitchSendFailed'

export type MessageWindowWarningKey = (typeof MESSAGE_WINDOW_WARNING_KEYS)[number]
export type PostSwitchMessageWindowWarningKey = (typeof POST_SWITCH_MESSAGE_WINDOW_WARNING_KEYS)[number]

export function isMessageWindowWarningKey(value: string): value is MessageWindowWarningKey {
    return (MESSAGE_WINDOW_WARNING_KEYS as readonly string[]).includes(value)
}

export function isPostSwitchMessageWindowWarningKey(
    value: MessageWindowWarningKey | string | null | undefined
): value is PostSwitchMessageWindowWarningKey {
    return typeof value === 'string' && (POST_SWITCH_MESSAGE_WINDOW_WARNING_KEYS as readonly string[]).includes(value)
}
