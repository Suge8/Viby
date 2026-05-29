export type NotificationAvailability = 'enabled' | 'disabled' | 'blocked' | 'install-required' | 'unavailable'

export type NotificationDescriptionKey =
    | 'settings.notifications.description.default'
    | 'settings.notifications.description.blocked'
    | 'settings.notifications.description.installRequired'
    | 'settings.notifications.description.unavailable'

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

export function getNotificationDescriptionKey(availability: NotificationAvailability): NotificationDescriptionKey {
    switch (availability) {
        case 'blocked':
            return 'settings.notifications.description.blocked'
        case 'install-required':
            return 'settings.notifications.description.installRequired'
        case 'unavailable':
            return 'settings.notifications.description.unavailable'
        default:
            return 'settings.notifications.description.default'
    }
}

export function isNotificationToggleDisabled(availability: NotificationAvailability): boolean {
    return availability === 'blocked' || availability === 'install-required' || availability === 'unavailable'
}
