import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumePendingAppRecovery } from '@/lib/appRecovery'
import {
    applyPendingRuntimeUpdate,
    publishRuntimeUpdateReady,
    RUNTIME_UPDATE_STORAGE_KEY,
    readPendingRuntimeUpdate,
    resetPendingRuntimeUpdate,
} from '@/lib/runtimeUpdateChannel'

describe('runtimeUpdateChannel', () => {
    afterEach(() => {
        resetPendingRuntimeUpdate()
        delete window.__vibyRealtimeTrace
    })

    it('publishes one pending runtime update and keeps the first timestamp stable', () => {
        const first = publishRuntimeUpdateReady(async () => undefined)
        const second = publishRuntimeUpdateReady(async () => undefined)

        expect(first).toEqual(second)
        expect(readPendingRuntimeUpdate()).toEqual(first)
        expect(window.__vibyRealtimeTrace?.map((entry) => entry.type)).toEqual(['update_available'])
    })

    it('applies and clears the pending runtime update action', async () => {
        const apply = vi.fn(async () => undefined)
        publishRuntimeUpdateReady(apply)

        await expect(applyPendingRuntimeUpdate()).resolves.toBe(true)
        expect(apply).toHaveBeenCalledTimes(1)
        expect(readPendingRuntimeUpdate()).toBeNull()
        expect(window.__vibyRealtimeTrace?.map((entry) => entry.type)).toEqual(['update_available', 'update_apply'])
    })

    it('keeps the pending update available when apply fails', async () => {
        const error = new Error('reload failed')
        publishRuntimeUpdateReady(async () => {
            throw error
        })

        await expect(applyPendingRuntimeUpdate()).rejects.toThrow('reload failed')
        expect(readPendingRuntimeUpdate()).not.toBeNull()
        expect(window.__vibyRealtimeTrace?.map((entry) => entry.type)).toEqual([
            'update_available',
            'update_apply',
            'update_apply_error',
        ])
    })

    it('deduplicates concurrent apply attempts onto one action', async () => {
        const apply = vi.fn(async () => undefined)
        publishRuntimeUpdateReady(apply)

        await expect(Promise.all([applyPendingRuntimeUpdate(), applyPendingRuntimeUpdate()])).resolves.toEqual([
            true,
            true,
        ])

        expect(apply).toHaveBeenCalledTimes(1)
    })

    it('restores storage-backed reload updates and records recovery before reloading', async () => {
        const reload = vi.fn()
        const location = window.location
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                ...location,
                reload,
            },
        })

        window.sessionStorage.setItem(
            RUNTIME_UPDATE_STORAGE_KEY,
            JSON.stringify({
                availableAt: 123,
                mode: 'reload',
                recoveryReason: 'vite-preload-error',
                resumeHref: '/sessions/session-1',
            })
        )

        expect(readPendingRuntimeUpdate()).toMatchObject({
            availableAt: 123,
            mode: 'reload',
            recoveryReason: 'vite-preload-error',
            resumeHref: '/sessions/session-1',
        })

        await expect(applyPendingRuntimeUpdate()).resolves.toBe(true)

        expect(reload).toHaveBeenCalledTimes(1)
        expect(consumePendingAppRecovery()).toMatchObject({
            reason: 'vite-preload-error',
            resumeHref: '/sessions/session-1',
        })
        expect(readPendingRuntimeUpdate()).toBeNull()
    })
})
