import { describe, expect, it } from 'vitest'
import {
    getNotificationDescriptionKey,
    isNotificationToggleDisabled,
    resolveNotificationSummary,
} from './settingsNotificationSupport'

describe('settings notification summary', () => {
    it('maps unsupported entries to a concise description and disables the toggle', () => {
        expect(getNotificationDescriptionKey('unavailable')).toBe('settings.notifications.description.unavailable')
        expect(isNotificationToggleDisabled('unavailable')).toBe(true)
    })

    it('shares the same default description for enabled and disabled states', () => {
        expect(getNotificationDescriptionKey('enabled')).toBe('settings.notifications.description.default')
        expect(getNotificationDescriptionKey('disabled')).toBe('settings.notifications.description.default')
        expect(isNotificationToggleDisabled('disabled')).toBe(false)
    })

    it('asks iOS Safari browser users to install before checking push support', () => {
        expect(
            resolveNotificationSummary({
                hasPushSupport: false,
                isIOSSafari: true,
                isStandalone: false,
                isSubscribed: false,
                permission: 'default',
            })
        ).toBe('install-required')
    })
})
