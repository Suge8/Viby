import { describe, expect, it, vi } from 'vitest'
import { buildOfflineNotice, buildRuntimeNotice } from '@/lib/runtimeNoticePresentation'

function createTranslationStub(): (key: string) => string {
    return (key: string) => key
}

describe('runtimeNoticePresentation', () => {
    it('uses one lightweight recovering notice for runtime busy work', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'busy' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            hasPendingRuntimeUpdate: false
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            tone: 'info',
            title: 'runtime.recovering.title',
            description: 'runtime.recovering.message'
        })
    })

    it('keeps offline notice compact and title-only', () => {
        const notice = buildOfflineNotice(false, createTranslationStub())

        expect(notice).toMatchObject({
            id: 'app:offline',
            title: 'offline.title',
            compact: true
        })
        expect(notice?.description).toBeUndefined()
    })

    it.each([
        'build-assets-reset',
        'local-service-worker-reset',
        'vite-preload-error',
        'runtime-asset-reload'
    ] as const)('collapses asset recovery reason %s into one unified local-dev notice', (reason) => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'restoring', reason },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'http://127.0.0.1:37173',
            hasPendingRuntimeUpdate: false
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            title: 'recovery.runtimeAssets.title',
            description: 'recovery.runtimeAssets.localDevMessage'
        })
    })

    it('shows a pending runtime update only on service-worker-backed origins', () => {
        const applyRuntimeUpdate = vi.fn(async () => true)

        const notice = buildRuntimeNotice({
            banner: { kind: 'hidden' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            hasPendingRuntimeUpdate: true,
            applyRuntimeUpdate
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            title: 'updateReady.title',
            compact: true
        })
        expect(notice?.description).toBeUndefined()
        expect(typeof notice?.onPress).toBe('function')
    })

    it('suppresses update-ready notices on local static origins', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'hidden' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'http://192.168.1.5:37173',
            hasPendingRuntimeUpdate: true,
            applyRuntimeUpdate: async () => true
        })

        expect(notice).toBeNull()
    })

    it('keeps recovery higher priority than an available runtime update', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'restoring', reason: 'page-restored' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            hasPendingRuntimeUpdate: true,
            applyRuntimeUpdate: async () => true
        })

        expect(notice).toMatchObject({
            title: 'recovery.pageRestored.title',
            description: 'recovery.pageRestored.message'
        })
    })
})
