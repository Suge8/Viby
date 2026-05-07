import { describe, expect, it } from 'vitest'
import { buildNotificationSummaryModel, resolveNotificationSummary } from './settingsNotificationSupport'

describe('settings notification summary', () => {
    it('keeps unsupported entries concise and product-facing', () => {
        expect(buildNotificationSummaryModel('unavailable')).toEqual({
            descriptionKey: 'settings.notifications.description.unavailable',
            statusLabelKey: 'unavailable',
        })
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
