import { describe, expect, it } from 'vitest'
import { shouldPreloadIdleSessionRoutes } from '@/lib/networkPreloadPolicy'

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
})
