import { afterEach, describe, expect, it, vi } from 'vitest'

describe('recoverFromVitePreloadError', () => {
    afterEach(() => {
        vi.resetModules()
        vi.restoreAllMocks()
        window.sessionStorage.clear()
    })

    it('reloads once when runtime asset recovery runs for the first time', async () => {
        const reload = vi.fn()
        const { recoverFromVitePreloadError } = await import('./installVitePreloadErrorHandler')

        await expect(recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)).resolves.toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('does not reload again when the same preload error already recovered in this tab', async () => {
        const reload = vi.fn()
        const { recoverFromVitePreloadError } = await import('./installVitePreloadErrorHandler')

        await expect(recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)).resolves.toBe(true)
        await expect(recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)).resolves.toBe(false)
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

        const navigationTask = runNavigationTransitionAfterPreload(preload, vi.fn(), {
            recoveryHref: '/sessions/session-1'
        })

        await expect(recoverFromVitePreloadError(new Error('Failed to fetch dynamically imported module'), reload)).resolves.toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
        expect(consumePendingAppRecovery()).toMatchObject({
            reason: 'vite-preload-error',
            resumeHref: '/sessions/session-1'
        })

        resolvePreload()
        await navigationTask
    })

    it('does not reload for generic chunk execution errors', async () => {
        const reload = vi.fn()
        const { recoverFromVitePreloadError } = await import('./installVitePreloadErrorHandler')

        await expect(recoverFromVitePreloadError(
            new ReferenceError("Cannot access 'tt' before initialization"),
            reload
        )).resolves.toBe(false)
        expect(reload).not.toHaveBeenCalled()
    })
})
