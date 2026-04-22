import { afterEach, describe, expect, it, vi } from 'vitest'

describe('recoverFromVitePreloadError', () => {
    afterEach(() => {
        vi.resetModules()
        vi.restoreAllMocks()
        window.sessionStorage.clear()
    })

    it('queues one explicit runtime update instead of reloading immediately on the first preload failure', async () => {
        const reload = vi.fn()
        const { recoverFromVitePreloadError } = await import('./installVitePreloadErrorHandler')
        const { applyPendingRuntimeUpdate, readPendingRuntimeUpdate } = await import('./runtimeUpdateChannel')

        await expect(
            recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)
        ).resolves.toBe(true)
        expect(reload).not.toHaveBeenCalled()
        expect(readPendingRuntimeUpdate()).not.toBeNull()

        await expect(applyPendingRuntimeUpdate()).resolves.toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('does not reload again when the same preload error already recovered in this tab', async () => {
        const reload = vi.fn()
        const { recoverFromVitePreloadError } = await import('./installVitePreloadErrorHandler')
        const { applyPendingRuntimeUpdate } = await import('./runtimeUpdateChannel')

        await expect(
            recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)
        ).resolves.toBe(true)
        await expect(
            recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)
        ).resolves.toBe(false)
        expect(reload).not.toHaveBeenCalled()

        await expect(applyPendingRuntimeUpdate()).resolves.toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('preserves the intended target href when a preload error interrupts navigation', async () => {
        let resolvePreload!: () => void
        const preload = new Promise<void>((resolve) => {
            resolvePreload = resolve
        })
        const reload = vi.fn()
        const { runNavigationTransitionAfterPreload } = await import('./navigationTransition')
        const { recoverFromVitePreloadError } = await import('./installVitePreloadErrorHandler')
        const { consumePendingAppRecovery } = await import('./appRecovery')
        const { applyPendingRuntimeUpdate, readPendingRuntimeUpdate } = await import('./runtimeUpdateChannel')

        const navigationTask = runNavigationTransitionAfterPreload(preload, vi.fn(), {
            recoveryHref: '/sessions/session-1',
        })

        await expect(
            recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)
        ).resolves.toBe(true)
        expect(reload).not.toHaveBeenCalled()
        expect(readPendingRuntimeUpdate()).toMatchObject({
            recoveryReason: 'vite-preload-error',
            resumeHref: '/sessions/session-1',
        })

        await expect(applyPendingRuntimeUpdate()).resolves.toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
        expect(consumePendingAppRecovery()).toMatchObject({
            reason: 'vite-preload-error',
            resumeHref: '/sessions/session-1',
        })

        resolvePreload()
        await navigationTask
    })

    it('does not reload for generic chunk execution errors', async () => {
        const reload = vi.fn()
        const { recoverFromVitePreloadError } = await import('./installVitePreloadErrorHandler')

        await expect(
            recoverFromVitePreloadError(new ReferenceError("Cannot access 'tt' before initialization"), reload)
        ).resolves.toBe(false)
        expect(reload).not.toHaveBeenCalled()
    })
})
