import { z } from 'zod'

export const DEVICE_PLATFORMS = ['ios', 'android', 'macos', 'windows', 'linux', 'unknown'] as const
export const DEVICE_CHANNELS = ['local', 'link', 'scan'] as const

export const DevicePlatformSchema = z.enum(DEVICE_PLATFORMS)
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>

export const DeviceChannelSchema = z.enum(DEVICE_CHANNELS)
export type DeviceChannel = z.infer<typeof DeviceChannelSchema>

/**
 * Detect a device platform from a User-Agent string. Accepts either the
 * standard `navigator.userAgent` or the newer `userAgentData.platform`.
 */
export function detectDevicePlatform(userAgent: string | null | undefined): DevicePlatform {
    if (!userAgent) return 'unknown'
    const value = userAgent.toLowerCase()
    if (/iphone|ipad|ipod|ios/.test(value)) return 'ios'
    if (/android/.test(value)) return 'android'
    if (/mac os x|macintosh|macos/.test(value)) return 'macos'
    if (/windows/.test(value)) return 'windows'
    if (/linux|cros/.test(value)) return 'linux'
    return 'unknown'
}
