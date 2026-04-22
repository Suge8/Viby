import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as appCacheDb from '@/lib/storage/appCacheDb'
import { applySessionAttentionSnapshot, resetSessionAttentionStoreForTests } from './sessionAttentionStore'

describe('sessionAttentionStore', () => {
    beforeEach(async () => {
        vi.restoreAllMocks()
        await resetSessionAttentionStoreForTests()
    })

    it('broadcasts only after the durable write succeeds', async () => {
        const writeSpy = vi.spyOn(appCacheDb, 'writeAppCacheRecord').mockResolvedValue(true)
        const publishSpy = vi.spyOn(appCacheDb, 'publishAppCacheBroadcast')

        applySessionAttentionSnapshot({ 'session-1': 123 })

        await resetSessionAttentionStoreForTests()

        expect(writeSpy).toHaveBeenCalled()
        expect(publishSpy).toHaveBeenCalledWith({
            type: 'session-attention-updated',
        })
    })

    it('does not broadcast stale state when the durable write fails', async () => {
        vi.spyOn(appCacheDb, 'writeAppCacheRecord').mockResolvedValue(false)
        const publishSpy = vi.spyOn(appCacheDb, 'publishAppCacheBroadcast')

        applySessionAttentionSnapshot({ 'session-1': 123 })

        await resetSessionAttentionStoreForTests()

        expect(publishSpy).not.toHaveBeenCalled()
    })
})
