import { type DevicePlatform, detectDevicePlatform } from '@viby/protocol/deviceAuth'

type UserAgentDataWithPlatform = {
    platform?: string
}

/**
 * User-facing device names used by the web client when labeling the pairing
 * participant (e.g. guest `label` on the broker). These are mirrored on the
 * desktop connection summary, so they must already be localized.
 */
export const DEVICE_PLATFORM_DISPLAY_LABELS: Record<DevicePlatform, string> = {
    ios: 'iPhone',
    android: 'Android',
    macos: 'Mac',
    windows: 'Windows',
    linux: 'Linux',
    unknown: '设备',
}

function readUserAgentData(): UserAgentDataWithPlatform | null {
    if (typeof navigator === 'undefined') return null
    const data = (navigator as Navigator & { userAgentData?: UserAgentDataWithPlatform }).userAgentData
    return data ?? null
}

function isIpadOsDesktopMode(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
    const maxTouch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0
    const ua = navigator.userAgent?.toLowerCase() ?? ''
    return maxTouch > 1 && /mac/.test(ua) && !/iphone|ipad|ipod/.test(ua)
}

/**
 * Resolve the device platform from the current browser. Prefers
 * `navigator.userAgentData.platform` (modern UA Client Hints) and falls back
 * to the legacy `navigator.userAgent` string. iPadOS in desktop mode is
 * reported as `ios` so we don't mislabel iPads as Macs.
 */
export function resolveClientPlatform(): DevicePlatform {
    if (isIpadOsDesktopMode()) return 'ios'
    const data = readUserAgentData()
    if (data?.platform) return detectDevicePlatform(data.platform)
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return detectDevicePlatform(navigator.userAgent)
    }
    return 'unknown'
}
