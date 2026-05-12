import { describe, expect, it } from 'vitest'
import { resolveInstallPlatform } from './usePWAInstall'

const BASE_OPTIONS = {
    dismissed: false,
    installState: 'idle' as const,
    isDesktopSafari: false,
    isIOS: false,
    isStandalone: false,
}

describe('resolveInstallPlatform', () => {
    it('resolves LAN HTTP as shortcut-only guidance', () => {
        const origin = 'http://192.168.1.8:37173'

        expect(resolveInstallPlatform({ ...BASE_OPTIONS, origin })).toBe('shortcut')
        expect(resolveInstallPlatform({ ...BASE_OPTIONS, isIOS: true, origin })).toBe('shortcut')
    })

    it('keeps localhost on the native event path instead of shortcut copy', () => {
        expect(resolveInstallPlatform({ ...BASE_OPTIONS, origin: 'http://localhost:37173' })).toBeNull()
    })

    it('uses manual Add to Dock guidance for trusted macOS Safari without beforeinstallprompt', () => {
        expect(
            resolveInstallPlatform({
                ...BASE_OPTIONS,
                isDesktopSafari: true,
                origin: 'https://app.viby.run',
            })
        ).toBe('desktop-safari')
    })

    it('keeps Chromium native install event above desktop Safari guidance', () => {
        expect(
            resolveInstallPlatform({
                ...BASE_OPTIONS,
                installState: 'available',
                isDesktopSafari: true,
                origin: 'https://app.viby.run',
            })
        ).toBe('native')
    })
})
