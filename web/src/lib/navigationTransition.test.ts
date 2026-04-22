import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const startTransitionMock = vi.fn((callback: () => void) => {
    callback()
})

vi.mock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react')
    return {
        ...actual,
        startTransition: startTransitionMock,
    }
})

type ViewTransitionDocument = Document & {
    startViewTransition?: Document['startViewTransition']
}

type ViewTransitionStarter = NonNullable<ViewTransitionDocument['startViewTransition']>

function installStartViewTransition(value?: ViewTransitionStarter): void {
    Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        writable: true,
        value: value as ViewTransitionStarter | undefined,
    })
}

describe('navigationTransition', () => {
    afterEach(() => {
        window.sessionStorage.clear()
    })

    beforeEach(() => {
        vi.resetModules()
        startTransitionMock.mockClear()
        installStartViewTransition()
    })

    it('uses the fallback transition owner when browser View Transition is unavailable', async () => {
        const commit = vi.fn()
        const { runNavigationTransition } = await import('./navigationTransition')

        runNavigationTransition(commit, { enableViewTransition: true })

        expect(startTransitionMock).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('keeps browser View Transition disabled even when the API exists', async () => {
        const startViewTransitionMock = vi.fn()
        installStartViewTransition(startViewTransitionMock)

        const commit = vi.fn()
        const { runNavigationTransition } = await import('./navigationTransition')

        runNavigationTransition(commit, { enableViewTransition: true })

        expect(startViewTransitionMock).not.toHaveBeenCalled()
        expect(startTransitionMock).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('reuses the shared default options when no recovery href is provided', async () => {
        const { VIEW_TRANSITION_NAVIGATION_OPTIONS, createNavigationTransitionOptions } = await import(
            './navigationTransition'
        )

        expect(createNavigationTransitionOptions()).toBe(VIEW_TRANSITION_NAVIGATION_OPTIONS)
    })

    it('creates merged navigation options when a recovery href is provided', async () => {
        const { createNavigationTransitionOptions } = await import('./navigationTransition')

        expect(createNavigationTransitionOptions('/sessions/session-1')).toEqual({
            enableViewTransition: true,
            recoveryHref: '/sessions/session-1',
        })
    })

    it('drops invalid recovery hrefs when creating navigation options', async () => {
        const { VIEW_TRANSITION_NAVIGATION_OPTIONS, createNavigationTransitionOptions } = await import(
            './navigationTransition'
        )

        expect(createNavigationTransitionOptions('https://bad.example')).toBe(VIEW_TRANSITION_NAVIGATION_OPTIONS)
        expect(createNavigationTransitionOptions('//bad.example')).toBe(VIEW_TRANSITION_NAVIGATION_OPTIONS)
    })

    it('clears the fallback transition flag after the scheduled frames', async () => {
        const commit = vi.fn()
        const { isNavigationTransitionActive, runNavigationTransition } = await import('./navigationTransition')
        const callbacks: FrameRequestCallback[] = []
        const originalRequestAnimationFrame = window.requestAnimationFrame
        window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
            callbacks.push(callback)
            return callbacks.length
        })

        runNavigationTransition(commit, { enableViewTransition: true })
        expect(isNavigationTransitionActive()).toBe(true)
        expect(callbacks).toHaveLength(1)

        const firstFrame = callbacks.shift()
        firstFrame?.(16)
        expect(isNavigationTransitionActive()).toBe(true)
        expect(callbacks).toHaveLength(1)

        const secondFrame = callbacks.shift()
        secondFrame?.(32)
        expect(isNavigationTransitionActive()).toBe(false)
        window.requestAnimationFrame = originalRequestAnimationFrame
    })

    it('clears the fallback transition flag when animation frames are throttled', async () => {
        vi.useFakeTimers()
        const commit = vi.fn()
        const { isNavigationTransitionActive, runNavigationTransition } = await import('./navigationTransition')
        const originalRequestAnimationFrame = window.requestAnimationFrame
        window.requestAnimationFrame = vi.fn(() => 1)

        runNavigationTransition(commit, { enableViewTransition: true })
        expect(isNavigationTransitionActive()).toBe(true)

        vi.advanceTimersByTime(240)
        expect(isNavigationTransitionActive()).toBe(false)

        window.requestAnimationFrame = originalRequestAnimationFrame
        vi.useRealTimers()
    })

    it('waits for preload to settle before committing navigation', async () => {
        let resolvePreload!: () => void
        const preload = new Promise<void>((resolve) => {
            resolvePreload = resolve
        })
        const order: string[] = []
        const commit = vi.fn(() => {
            order.push('commit')
        })
        const { runNavigationTransitionAfterPreload } = await import('./navigationTransition')

        const task = runNavigationTransitionAfterPreload(preload, commit)
        expect(order).toEqual([])

        resolvePreload()
        await task

        expect(order).toEqual(['commit'])
        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('still commits navigation when preload rejects', async () => {
        const commit = vi.fn()
        const { runNavigationTransitionAfterPreload } = await import('./navigationTransition')

        await runNavigationTransitionAfterPreload(Promise.reject(new Error('preload failed')), commit)

        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('records a recovery href when preload fails with a stale runtime asset error', async () => {
        const commit = vi.fn()
        const { runNavigationTransitionAfterPreload, readPendingNavigationRecoveryHref } = await import(
            './navigationTransition'
        )
        const { consumePendingAppRecovery } = await import('./appRecovery')

        await runNavigationTransitionAfterPreload(
            Promise.reject(new Error('Failed to fetch dynamically imported module')),
            commit,
            { recoveryHref: '/sessions/session-1' }
        )

        expect(commit).toHaveBeenCalledTimes(1)
        expect(consumePendingAppRecovery()).toMatchObject({
            reason: 'vite-preload-error',
            resumeHref: '/sessions/session-1',
        })
        expect(readPendingNavigationRecoveryHref()).toBeNull()
    })

    it('exposes the intended recovery href while preload is still pending', async () => {
        let resolvePreload!: () => void
        const preload = new Promise<void>((resolve) => {
            resolvePreload = resolve
        })
        const commit = vi.fn()
        const { runNavigationTransitionAfterPreload, readPendingNavigationRecoveryHref } = await import(
            './navigationTransition'
        )

        const task = runNavigationTransitionAfterPreload(preload, commit, {
            recoveryHref: '/sessions/session-1',
        })

        expect(readPendingNavigationRecoveryHref()).toBe('/sessions/session-1')

        resolvePreload()
        await task

        expect(readPendingNavigationRecoveryHref()).toBeNull()
    })

    it('reuses the shared preload wrapper for recovery-aware navigation commits', async () => {
        let resolvePreload!: () => void
        const preload = new Promise<void>((resolve) => {
            resolvePreload = resolve
        })
        const commit = vi.fn()
        const { runPreloadedNavigation, readPendingNavigationRecoveryHref } = await import('./navigationTransition')

        runPreloadedNavigation(preload, commit, '/sessions/session-1/files')

        expect(readPendingNavigationRecoveryHref()).toBe('/sessions/session-1/files')

        resolvePreload()

        await vi.waitFor(() => {
            expect(commit).toHaveBeenCalledTimes(1)
        })
        expect(readPendingNavigationRecoveryHref()).toBeNull()
    })

    it('lets only the latest preloaded navigation commit when multiple selections race', async () => {
        let resolveFirst!: () => void
        let resolveSecond!: () => void
        const firstPreload = new Promise<void>((resolve) => {
            resolveFirst = resolve
        })
        const secondPreload = new Promise<void>((resolve) => {
            resolveSecond = resolve
        })
        const firstCommit = vi.fn()
        const secondCommit = vi.fn()
        const { runNavigationTransitionAfterPreload } = await import('./navigationTransition')

        const firstTask = runNavigationTransitionAfterPreload(firstPreload, firstCommit, {
            recoveryHref: '/sessions/session-a',
        })
        const secondTask = runNavigationTransitionAfterPreload(secondPreload, secondCommit, {
            recoveryHref: '/sessions/session-b',
        })

        resolveSecond()
        await secondTask

        expect(secondCommit).toHaveBeenCalledTimes(1)
        expect(firstCommit).not.toHaveBeenCalled()

        resolveFirst()
        await firstTask

        expect(firstCommit).not.toHaveBeenCalled()
    })

    it('cancels a preloaded navigation commit after the user has already navigated away', async () => {
        let resolvePreload!: () => void
        const preload = new Promise<void>((resolve) => {
            resolvePreload = resolve
        })
        const commit = vi.fn()
        const { runNavigationTransitionAfterPreload } = await import('./navigationTransition')

        window.history.replaceState({}, '', '/sessions')
        const task = runNavigationTransitionAfterPreload(preload, commit, {
            recoveryHref: '/sessions/fcb8b890-985a-4b4f-bf69-d437a7142d48',
        })

        window.history.replaceState({}, '', '/sessions/new')
        resolvePreload()
        await task

        expect(commit).not.toHaveBeenCalled()
    })

    it('cancels a preloaded navigation commit after the user leaves and later returns to the same source location', async () => {
        let resolvePreload!: () => void
        const preload = new Promise<void>((resolve) => {
            resolvePreload = resolve
        })
        const commit = vi.fn()
        const { runNavigationTransitionAfterPreload } = await import('./navigationTransition')

        window.history.replaceState({}, '', '/sessions')
        const task = runNavigationTransitionAfterPreload(preload, commit, {
            recoveryHref: '/sessions/fcb8b890-985a-4b4f-bf69-d437a7142d48',
        })

        window.history.pushState({}, '', '/sessions/new')
        window.history.pushState({}, '', '/sessions')
        resolvePreload()
        await task

        expect(commit).not.toHaveBeenCalled()
    })
})
