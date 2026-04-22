export const NOTIFICATION_STATUS_LABEL_KEYS = {
    enabled: 'settings.notifications.status.enabled',
    disabled: 'settings.notifications.status.disabled',
    blocked: 'settings.notifications.status.blocked',
    installRequired: 'settings.notifications.status.installRequired',
    unavailable: 'settings.notifications.status.unavailable',
} as const

export type NotificationAvailability = 'enabled' | 'disabled' | 'blocked' | 'install-required' | 'unavailable'

export type NotificationSummaryModel = {
    descriptionKey: string
    detailKey?: string
    statusLabelKey: keyof typeof NOTIFICATION_STATUS_LABEL_KEYS
}

export function resolveNotificationSummary(options: {
    hasPushSupport: boolean
    isIOSSafari: boolean
    isStandalone: boolean
    isSubscribed: boolean
    permission: NotificationPermission
}): NotificationAvailability {
    if (options.isIOSSafari && !options.isStandalone) {
        return 'install-required'
    }
    if (!options.hasPushSupport) {
        return 'unavailable'
    }
    if (options.isSubscribed) {
        return 'enabled'
    }
    if (options.permission === 'denied') {
        return 'blocked'
    }

    return 'disabled'
}

export function buildNotificationSummaryModel(availability: NotificationAvailability): NotificationSummaryModel {
    switch (availability) {
        case 'enabled':
            return {
                descriptionKey: 'settings.notifications.description.enabled',
                detailKey: 'settings.notifications.detail.events',
                statusLabelKey: 'enabled',
            }
        case 'blocked':
            return {
                descriptionKey: 'settings.notifications.description.blocked',
                detailKey: 'settings.notifications.detail.blocked',
                statusLabelKey: 'blocked',
            }
        case 'install-required':
            return {
                descriptionKey: 'settings.notifications.description.installRequired',
                detailKey: 'settings.notifications.detail.installRequired',
                statusLabelKey: 'installRequired',
            }
        case 'unavailable':
            return {
                descriptionKey: 'settings.notifications.description.unavailable',
                detailKey: 'settings.notifications.detail.unavailable',
                statusLabelKey: 'unavailable',
            }
        case 'disabled':
        default:
            return {
                descriptionKey: 'settings.notifications.description.disabled',
                detailKey: 'settings.notifications.detail.events',
                statusLabelKey: 'disabled',
            }
    }
}
