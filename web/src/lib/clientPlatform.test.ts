import { describe, expect, it } from 'vitest'
import { DEVICE_PLATFORM_DISPLAY_LABELS, resolveClientPlatform } from './clientPlatform'

function setNavigator(
    override: Partial<Navigator> & { userAgentData?: { platform?: string }; maxTouchPoints?: number }
): void {
    Object.defineProperty(window, 'navigator', {
        configurable: true,
        value: override as unknown as Navigator,
    })
}

describe('resolveClientPlatform', () => {
    it('prefers userAgentData.platform when present', () => {
        setNavigator({ userAgentData: { platform: 'macOS' }, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
        expect(resolveClientPlatform()).toBe('macos')
    })

    it('falls back to userAgent string', () => {
        setNavigator({ userAgentData: {}, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })
        expect(resolveClientPlatform()).toBe('ios')
    })

    it('returns unknown when no UA info is available', () => {
        setNavigator({ userAgentData: {}, userAgent: '' })
        expect(resolveClientPlatform()).toBe('unknown')
    })

    it('detects iPadOS in desktop mode via touch points', () => {
        // Safari on iPad “Request Desktop Website” reports Mac UA and maxTouchPoints > 1.
        setNavigator({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
            userAgentData: { platform: 'macOS' },
            maxTouchPoints: 5,
        })
        expect(resolveClientPlatform()).toBe('ios')
    })
})

describe('DEVICE_PLATFORM_DISPLAY_LABELS', () => {
    it('provides a localized label for every platform variant', () => {
        expect(DEVICE_PLATFORM_DISPLAY_LABELS.ios).toBe('iPhone')
        expect(DEVICE_PLATFORM_DISPLAY_LABELS.macos).toBe('Mac')
        expect(DEVICE_PLATFORM_DISPLAY_LABELS.unknown).toBe('设备')
    })
})
