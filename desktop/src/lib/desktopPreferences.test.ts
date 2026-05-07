import { describe, expect, it } from 'bun:test'
import {
    getSystemLanguage,
    readEntryModePreference,
    resolveLanguagePreference,
    resolveThemePreference,
    writeEntryModePreference,
} from './desktopPreferences'

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

    it('persists entry mode as an explicit desktop preference', () => {
        const storage = new Map<string, string>() as unknown as Storage
        storage.getItem = (key: string) => Map.prototype.get.call(storage, key) ?? null
        storage.setItem = (key: string, value: string) => {
            Map.prototype.set.call(storage, key, value)
        }

        expect(readEntryModePreference(storage)).toBe('local')
        writeEntryModePreference(storage, 'lan')
        expect(readEntryModePreference(storage)).toBe('lan')
    })
})
