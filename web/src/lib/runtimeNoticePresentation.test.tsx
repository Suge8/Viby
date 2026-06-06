import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'
import { buildOfflineNotice, buildRuntimeNotice, buildRuntimeUpdateNotice } from '@/lib/runtimeNoticePresentation'

function createTranslationStub(): (key: string) => string {
    return (key: string) => key
}

describe('runtimeNoticePresentation', () => {
    it('uses one warning reconnecting notice for runtime busy work', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'busy' },
            isOnline: true,
            t: createTranslationStub(),
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtime,
            tone: 'warning',
            title: 'runtime.recovering.title',
            description: 'runtime.recovering.message',
            compact: true,
        })
    })

    it('keeps offline notice compact and title-only', () => {
        const notice = buildOfflineNotice(false, createTranslationStub())

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.offline,
            tone: 'warning',
            title: 'offline.title',
            compact: true,
        })
        expect(notice?.description).toBeUndefined()
    })

    it.each([
        'page-discarded',
        'page-restored',
        'local-service-worker-reset',
        'vite-preload-error',
        'runtime-asset-reload',
    ] as const)('collapses recovery reason %s into the same reconnecting notice', (reason) => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'restoring', reason },
            isOnline: true,
            t: createTranslationStub(),
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtime,
            tone: 'warning',
            title: 'runtime.recovering.title',
            description: 'runtime.recovering.message',
            compact: true,
        })
    })

    it('builds failed recovery notice with explicit retry', () => {
        const retry = vi.fn()
        const notice = buildRuntimeNotice({
            banner: { kind: 'failed', retry },
            isOnline: true,
            t: createTranslationStub(),
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtime,
            tone: 'danger',
            title: 'runtime.recoveryFailed.title',
            description: 'runtime.recoveryFailed.message',
            compact: true,
        })

        render(<>{notice?.action}</>)
        fireEvent.click(screen.getByRole('button', { name: 'runtime.recoveryFailed.action' }))
        expect(retry).toHaveBeenCalledTimes(1)
    })

    it('keeps prepared updates out of persistent runtime notices', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'hidden' },
            isOnline: true,
            t: createTranslationStub(),
            localRuntimeUnavailableDescription: null,
        })

        expect(notice).toBeNull()
    })

    it('shows runtime unavailable through the shared compact runtime notice owner', () => {
        const notice = buildRuntimeNotice({
            banner: { kind: 'busy' },
            isOnline: true,
            t: createTranslationStub(),
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

    it('builds a compact runtime update notice with an explicit refresh action', () => {
        const onApply = vi.fn()
        const notice = buildRuntimeUpdateNotice({ t: createTranslationStub(), onApply })

        expect(notice).toMatchObject({
            id: PERSISTENT_NOTICE_IDS.runtimeUpdate,
            tone: 'info',
            title: 'updateReady.title',
            compact: true,
        })

        render(<>{notice.action}</>)
        fireEvent.click(screen.getByRole('button', { name: 'updateReady.action' }))
        expect(onApply).toHaveBeenCalledTimes(1)
    })
})
