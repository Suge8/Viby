import { describe, expect, it } from 'vitest'
import { PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'
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
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtime,
            tone: 'info',
            title: 'runtime.recovering.title',
            description: 'runtime.recovering.message',
            compact: true,
        })
    })

    it('keeps offline notice compact and title-only', () => {
        const notice = buildOfflineNotice(false, createTranslationStub())

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.offline,
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
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtime,
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
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtime,
            title: 'recovery.runtimeAssets.title',
            description: 'recovery.runtimeAssets.devMessage',
            compact: true,
        })
    })

    it('keeps prepared updates out of persistent runtime notices', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'hidden' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            isDevRuntime: false,
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toBeNull()
    })

    it('keeps recovery higher priority than an available runtime update', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'restoring', reason: 'page-restored' },
            isOnline: true,
            t: createTranslationStub(),
            currentOrigin: 'https://app.viby.run',
            isDevRuntime: false,
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
            localRuntimeUnavailableDescription: 'runtime.unavailable.lastError',
        })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtime,
            tone: 'warning',
            title: 'runtime.unavailable.title',
            description: 'runtime.unavailable.lastError',
            compact: true,
        })
    })
})
