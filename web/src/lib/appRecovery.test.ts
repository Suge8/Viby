import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    APP_BOOT_RECOVERY_SURFACE_OWNER_KEY,
    APP_BOOT_SHELL_ID,
    APP_RECOVERY_MAX_AGE_MS,
    APP_SHELL_REVEALED_KEY,
    consumeBootRecoverySurfaceOwner,
    consumeDiscardedPageRecovery,
    consumePendingAppRecovery,
    finalizeBootShell,
    recordPendingAppRecovery,
    reloadWindowForRecovery,
    resetAppRecoveryState,
} from '@/lib/appRecovery'

describe('appRecovery', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        resetAppRecoveryState()
        window.sessionStorage.clear()
        document.body.innerHTML = ''
    })

    it('records and consumes pending recovery snapshots once', () => {
        recordPendingAppRecovery('runtime-asset-reload', {
            resumeHref: '/sessions/session-1',
        })

        const snapshot = consumePendingAppRecovery()
        expect(snapshot?.reason).toBe('runtime-asset-reload')
        expect(typeof snapshot?.at).toBe('number')
        expect(snapshot?.resumeHref).toBe('/sessions/session-1')
        expect(consumePendingAppRecovery()).toBeNull()
    })

    it('records the reason before reloading for recovery', () => {
        const reload = vi.fn()

        reloadWindowForRecovery('vite-preload-error', reload)

        expect(reload).toHaveBeenCalledTimes(1)
        expect(consumePendingAppRecovery()?.reason).toBe('vite-preload-error')
    })

    it('preserves an existing resume href when reload records the same recovery without one', () => {
        const reload = vi.fn()

        recordPendingAppRecovery('vite-preload-error', {
            resumeHref: '/sessions/session-1',
        })
        reloadWindowForRecovery('vite-preload-error', reload)

        const snapshot = consumePendingAppRecovery()
        expect(reload).toHaveBeenCalledTimes(1)
        expect(snapshot?.reason).toBe('vite-preload-error')
        expect(snapshot?.resumeHref).toBe('/sessions/session-1')
    })

    it('drops stale pending recovery snapshots instead of replaying old recovery chrome', () => {
        vi.useFakeTimers()
        recordPendingAppRecovery('runtime-asset-reload', {
            resumeHref: '/sessions/session-1',
        })

        vi.advanceTimersByTime(APP_RECOVERY_MAX_AGE_MS + 1)

        expect(consumePendingAppRecovery()).toBeNull()
        vi.useRealTimers()
    })

    it('consumes a discarded-page recovery snapshot only once per page lifetime', () => {
        Object.defineProperty(document, 'wasDiscarded', {
            configurable: true,
            value: true,
        })

        expect(consumeDiscardedPageRecovery()?.reason).toBe('page-discarded')
        expect(consumeDiscardedPageRecovery()).toBeNull()
    })

    it('consumes the one-shot boot recovery surface owner marker', () => {
        window.sessionStorage.setItem(APP_BOOT_RECOVERY_SURFACE_OWNER_KEY, 'boot-shell')

        expect(consumeBootRecoverySurfaceOwner()).toBe(true)
        expect(consumeBootRecoverySurfaceOwner()).toBe(false)
    })

    it('fades out and removes the boot shell after the app hydrates', () => {
        vi.useFakeTimers()
        document.body.innerHTML = `<div id="${APP_BOOT_SHELL_ID}"></div>`

        finalizeBootShell()

        const bootShell = document.getElementById(APP_BOOT_SHELL_ID)
        expect(bootShell?.classList.contains('is-hidden')).toBe(true)
        expect(window.sessionStorage.getItem(APP_SHELL_REVEALED_KEY)).toBe('done')

        vi.advanceTimersByTime(300)
        expect(document.getElementById(APP_BOOT_SHELL_ID)).toBeNull()
        vi.useRealTimers()
    })
})
