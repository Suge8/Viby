import type { DeviceChannel, DevicePlatform } from '@viby/protocol/deviceAuth'

const PLATFORM_LABELS: Record<DevicePlatform, string> = {
    ios: 'iPhone',
    android: 'Android',
    macos: 'Mac',
    windows: 'Windows',
    linux: 'Linux',
    unknown: '未知设备',
}

const PLATFORM_ICONS: Record<DevicePlatform, string> = {
    ios: '📱',
    android: '📱',
    macos: '💻',
    windows: '🖥',
    linux: '🖥',
    unknown: '📟',
}

const CHANNEL_LABELS: Record<DeviceChannel, string> = {
    local: '本机',
    link: '局域网',
    scan: '公网',
}

/**
 * Placeholder names written before platform / channel were first-class.
 * Treated as non-user-meaningful so the title resolver takes over.
 */
const STALE_PLACEHOLDER_NAMES = new Set(['Device', 'Device PWA', '公网扫码设备', '未命名设备'])

function normalizePlatform(value: DevicePlatform | string | null | undefined): DevicePlatform {
    if (!value) return 'unknown'
    return (value as DevicePlatform) in PLATFORM_LABELS ? (value as DevicePlatform) : 'unknown'
}

function normalizeChannel(value: DeviceChannel | string | null | undefined): DeviceChannel | null {
    if (value === 'local' || value === 'link' || value === 'scan') return value
    return null
}

function resolveDeviceTitleFromPlatform(platform: DevicePlatform, channel: DeviceChannel | null): string {
    if (platform !== 'unknown') return PLATFORM_LABELS[platform]
    if (channel === 'local') return '本机浏览器'
    if (channel === 'scan') return '扫码设备'
    if (channel === 'link') return '局域网设备'
    return '未知设备'
}

export function formatDevicePlatform(value: DevicePlatform | string | null | undefined): {
    icon: string
    label: string
} {
    const platform = normalizePlatform(value)
    return { icon: PLATFORM_ICONS[platform], label: PLATFORM_LABELS[platform] }
}

export function formatDeviceChannel(value: DeviceChannel | string | null | undefined): string | null {
    const channel = normalizeChannel(value)
    return channel ? CHANNEL_LABELS[channel] : null
}

/**
 * Compose a human-readable device title.
 *
 * Priority: user-provided name (if meaningful) → platform label → channel-
 * specific fallback. Stale placeholder names (`Device`, `公网扫码设备`, etc.)
 * are ignored so the list isn't stuck on obsolete strings.
 */
export function formatDeviceTitle(input: {
    name?: string | null
    platform?: DevicePlatform | string | null
    channel?: DeviceChannel | string | null
}): string {
    const trimmed = input.name?.trim()
    if (trimmed && trimmed.length > 0 && !STALE_PLACEHOLDER_NAMES.has(trimmed)) return trimmed
    return resolveDeviceTitleFromPlatform(normalizePlatform(input.platform), normalizeChannel(input.channel))
}
