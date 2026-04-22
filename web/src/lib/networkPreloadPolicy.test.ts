import { describe, expect, it } from 'vitest'
import { shouldPreloadForegroundSessionDetail, shouldPreloadIdleSessionRoutes } from '@/lib/networkPreloadPolicy'

describe('network preload policy', () => {
    it('allows idle preloading when connection info is unavailable', () => {
        expect(shouldPreloadIdleSessionRoutes()).toBe(true)
    })

    it('disables idle preloading when save-data is enabled', () => {
        expect(shouldPreloadIdleSessionRoutes({ saveData: true, effectiveType: '4g' })).toBe(false)
    })

    it('disables idle preloading on slow mobile connections', () => {
        expect(shouldPreloadIdleSessionRoutes({ effectiveType: '3g' })).toBe(false)
        expect(shouldPreloadIdleSessionRoutes({ effectiveType: '2g' })).toBe(false)
    })

    it('keeps idle preloading on fast connections', () => {
        expect(shouldPreloadIdleSessionRoutes({ effectiveType: '4g' })).toBe(true)
    })

    it('disables foreground preloading while the page is hidden', () => {
        expect(shouldPreloadForegroundSessionDetail({ connection: { effectiveType: '4g' } })).toBe(true)
        expect(
            shouldPreloadForegroundSessionDetail({
                connection: { effectiveType: '4g' },
                visibilityState: 'hidden',
            })
        ).toBe(false)
    })
})
