import { describe, expect, it } from 'bun:test'
import { getSystemLanguage, resolveLanguagePreference, resolveThemePreference } from './desktopPreferences'

describe('desktopPreferences', () => {
    it('resolves system theme without overriding explicit choices', () => {
        expect(resolveThemePreference('system', 'dark')).toBe('dark')
        expect(resolveThemePreference('light', 'dark')).toBe('light')
    })

    it('uses Chinese only for zh system locales', () => {
        expect(getSystemLanguage('zh-CN')).toBe('zh')
        expect(getSystemLanguage('en-US')).toBe('en')
    })

    it('resolves language preference from system fallback', () => {
        expect(resolveLanguagePreference('system', 'zh')).toBe('zh')
        expect(resolveLanguagePreference('en', 'zh')).toBe('en')
    })
})
