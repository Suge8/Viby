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
            isDevRuntime: false,
            hasPendingRuntimeUpdate: false,
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            tone: 'info',
            title: 'runtime.recovering.title',
            description: 'runtime.recovering.message',
            compact: true,
        })
    })

    it('keeps offline notice compact and title-only', () => {
        const notice = buildOfflineNotice(false, createTranslationStub())

        expect(notice).toMatchObject({
            id: 'app:offline',
            title: 'offline.title',
            compact: true,
        })
        expect(notice?.description).toBeUndefined()
    })

    it.each([
        'local-service-worker-reset',
        'vite-preload-error',
        'runtime-asset-reload',
    ] as const)('collapses asset recovery reason %s into one unified local-dev notice', (reason) => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'restoring', reason },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'http://127.0.0.1:37173',
            isDevRuntime: false,
            hasPendingRuntimeUpdate: false,
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            title: 'recovery.runtimeAssets.title',
            description: 'recovery.runtimeAssets.localStaticMessage',
            compact: true,
        })
    })

    it('uses a dev-server-specific recovery message on local development origins', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'restoring', reason: 'vite-preload-error' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'http://127.0.0.1:5173',
            isDevRuntime: true,
            hasPendingRuntimeUpdate: false,
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            title: 'recovery.runtimeAssets.title',
            description: 'recovery.runtimeAssets.devMessage',
            compact: true,
        })
    })

    it('shows a pending runtime update through the single compact notice owner', () => {
        const applyRuntimeUpdate = vi.fn(async () => true)

        const notice = buildRuntimeNotice({
            banner: { kind: 'hidden' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            isDevRuntime: false,
            hasPendingRuntimeUpdate: true,
            applyRuntimeUpdate,
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            title: 'updateReady.title',
            compact: true,
        })
        expect(notice?.description).toBeUndefined()
        expect(typeof notice?.onPress).toBe('function')
    })

    it('keeps update-ready notices available on local static origins too', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'hidden' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'http://192.168.1.5:37173',
            isDevRuntime: false,
            hasPendingRuntimeUpdate: true,
            applyRuntimeUpdate: async () => true,
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            title: 'updateReady.title',
            compact: true,
        })
    })

    it('keeps recovery higher priority than an available runtime update', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'restoring', reason: 'page-restored' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            isDevRuntime: false,
            hasPendingRuntimeUpdate: true,
            applyRuntimeUpdate: async () => true,
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            title: 'recovery.pageRestored.title',
            description: 'recovery.pageRestored.message',
            compact: true,
        })
    })

    it('shows runtime unavailable through the shared compact runtime notice owner', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'busy' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            isDevRuntime: false,
            hasPendingRuntimeUpdate: true,
            applyRuntimeUpdate: async () => true,
            localRuntimeUnavailableDescription: 'runtime.unavailable.lastError',
        })

        expect(notice).toMatchObject({
            id: 'app:runtime',
            tone: 'warning',
            title: 'runtime.unavailable.title',
            description: 'runtime.unavailable.lastError',
            compact: true,
        })
    })
})
