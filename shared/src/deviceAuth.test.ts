import { describe, expect, it } from 'bun:test'
import { DeviceChannelSchema, DevicePlatformSchema, detectDevicePlatform } from './deviceAuth'

describe('DevicePlatformSchema', () => {
    it('accepts the canonical platform set', () => {
        expect(() => DevicePlatformSchema.parse('ios')).not.toThrow()
        expect(() => DevicePlatformSchema.parse('unknown')).not.toThrow()
    })

    it('rejects unexpected values', () => {
        expect(() => DevicePlatformSchema.parse('blackberry')).toThrow()
    })
})

describe('DeviceChannelSchema', () => {
    it('accepts the three supported channels', () => {
        expect(() => DeviceChannelSchema.parse('local')).not.toThrow()
        expect(() => DeviceChannelSchema.parse('link')).not.toThrow()
        expect(() => DeviceChannelSchema.parse('scan')).not.toThrow()
    })
})

describe('detectDevicePlatform', () => {
    it('detects iOS from iPhone UA', () => {
        expect(detectDevicePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
    })

    it('detects iOS from iPad UA', () => {
        expect(detectDevicePlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios')
    })

    it('detects Android', () => {
        expect(detectDevicePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android')
    })

    it('detects macOS', () => {
        expect(detectDevicePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('macos')
    })

    it('detects Windows', () => {
        expect(detectDevicePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    })

    it('detects Linux', () => {
        expect(detectDevicePlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
    })

    it('falls back to unknown for missing UA', () => {
        expect(detectDevicePlatform(null)).toBe('unknown')
        expect(detectDevicePlatform(undefined)).toBe('unknown')
        expect(detectDevicePlatform('')).toBe('unknown')
    })

    it('prefers ios over macos when both tokens present (iPadOS desktop mode)', () => {
        // iPad in desktop mode: "Mozilla/5.0 (Macintosh; Intel Mac OS X) ... iPad"
        expect(detectDevicePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit iPad')).toBe('ios')
    })
})
