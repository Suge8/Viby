import { beforeEach, describe, expect, it } from 'vitest'
import { readMessageWindowWarmSnapshot } from '@/lib/messageWindowWarmSnapshot'
import { readSessionAttentionSnapshot } from '@/lib/sessionAttentionStore'
import { readSessionsWarmSnapshot } from '@/lib/sessionsWarmSnapshot'
import { readSessionWarmSnapshot } from '@/lib/sessionWarmSnapshot'
import { preloadAppCacheRuntime } from './preloadAppCacheRuntime'

describe('preloadAppCacheRuntime', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    it('hydrates AppCache-backed runtime snapshots without reading localStorage compatibility caches', async () => {
        window.localStorage.setItem('unrelated-key', 'kept')

        await preloadAppCacheRuntime()

        expect(window.localStorage.getItem('unrelated-key')).toBe('kept')
        expect(readMessageWindowWarmSnapshot('session-1')).toBeNull()
        expect(readSessionWarmSnapshot('session-1')).toBeUndefined()
        expect(readSessionsWarmSnapshot()).toBeUndefined()
        expect(readSessionAttentionSnapshot()).toEqual({})
    })
})
