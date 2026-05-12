import { describe, expect, it } from 'bun:test'
import { formatDeviceChannel, formatDevicePlatform, formatDeviceTitle } from './deviceDisplay'

describe('formatDevicePlatform', () => {
    it('returns iPhone label and mobile icon for ios', () => {
        expect(formatDevicePlatform('ios')).toEqual({ icon: '📱', label: 'iPhone' })
    })

    it('returns Mac label and desktop icon for macos', () => {
        expect(formatDevicePlatform('macos')).toEqual({ icon: '💻', label: 'Mac' })
    })

    it('normalizes unknown values to the fallback device label', () => {
        expect(formatDevicePlatform(null)).toEqual({ icon: '📟', label: '未知设备' })
        expect(formatDevicePlatform('blackberry')).toEqual({ icon: '📟', label: '未知设备' })
    })
})

describe('formatDeviceChannel', () => {
    it('maps the three canonical channels to Chinese labels', () => {
        expect(formatDeviceChannel('local')).toBe('本机')
        expect(formatDeviceChannel('link')).toBe('局域网')
        expect(formatDeviceChannel('scan')).toBe('公网')
    })

    it('returns null for unknown channels', () => {
        expect(formatDeviceChannel(null)).toBeNull()
        expect(formatDeviceChannel('bluetooth')).toBeNull()
    })
})

describe('formatDeviceTitle', () => {
    it('prefers a meaningful user-provided device name', () => {
        expect(formatDeviceTitle({ name: 'Alice iPhone', platform: 'ios' })).toBe('Alice iPhone')
    })

    it('falls back to platform label when name is blank', () => {
        expect(formatDeviceTitle({ name: '   ', platform: 'macos' })).toBe('Mac')
        expect(formatDeviceTitle({ name: null, platform: 'windows' })).toBe('Windows')
    })

    it('ignores stale placeholder names so stale DB rows resolve from platform/channel', () => {
        expect(formatDeviceTitle({ name: '公网扫码设备', platform: 'ios', channel: 'scan' })).toBe('iPhone')
        expect(formatDeviceTitle({ name: 'Device', platform: 'ios', channel: 'scan' })).toBe('iPhone')
        expect(formatDeviceTitle({ name: 'Device PWA', platform: 'macos', channel: 'scan' })).toBe('Mac')
    })

    it('uses channel-aware fallback when no platform is available', () => {
        expect(formatDeviceTitle({ name: null, platform: null, channel: 'local' })).toBe('本机浏览器')
        expect(formatDeviceTitle({ name: null, platform: null, channel: 'scan' })).toBe('扫码设备')
        expect(formatDeviceTitle({ name: null, platform: null, channel: 'link' })).toBe('局域网设备')
        expect(formatDeviceTitle({ name: null, platform: null, channel: null })).toBe('未知设备')
    })
})
