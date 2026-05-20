export type WebPushNotificationData = {
    type?: string
    sessionId?: string
    url?: string
}

export type WebPushNotificationPayload = {
    title: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: WebPushNotificationData
}

export type WebPushNotificationDisplay = {
    title: string
    options: {
        body: string
        icon: string
        badge: string
        data?: WebPushNotificationData
        tag?: string
    }
}

const DEFAULT_WEB_PUSH_TITLE = 'Viby'
const DEFAULT_WEB_PUSH_ICON = '/pwa-192x192.png'
const DEFAULT_WEB_PUSH_BADGE = '/pwa-64x64.png'

export function buildWebPushNotificationDisplay(payload: WebPushNotificationPayload): WebPushNotificationDisplay {
    return {
        title: payload.title || DEFAULT_WEB_PUSH_TITLE,
        options: {
            body: payload.body ?? '',
            icon: payload.icon ?? DEFAULT_WEB_PUSH_ICON,
            badge: payload.badge ?? DEFAULT_WEB_PUSH_BADGE,
            data: payload.data,
            tag: payload.tag,
        },
    }
}
