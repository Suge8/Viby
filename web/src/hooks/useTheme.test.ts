import { describe, expect, it } from 'vitest'
import { getThemeColorForScheme, syncThemeColorMeta } from './useTheme'

describe('theme color meta', () => {
    it('uses app surface colors for PWA chrome', () => {
        expect(getThemeColorForScheme('light')).toBe('#fbfaf6')
        expect(getThemeColorForScheme('dark')).toBe('#1c1c1e')
    })

    it('updates one unmanaged theme-color meta tag for the active scheme', () => {
        document.head.innerHTML = '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">'

        syncThemeColorMeta('dark')

        const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        expect(metas).toHaveLength(1)
        expect(metas[0]?.content).toBe('#1c1c1e')
        expect(metas[0]?.getAttribute('media')).toBeNull()
    })
})
