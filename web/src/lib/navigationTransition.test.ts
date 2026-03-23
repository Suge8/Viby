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

type ViewTransitionHandle = {
    finished: Promise<void>
    ready: Promise<void>
    updateCallbackDone: Promise<void>
    skipTransition: () => void
    types: Set<string>
}

type ViewTransitionDocument = Document & {
    startViewTransition?: Document['startViewTransition']
}

type ViewTransitionStarter = NonNullable<ViewTransitionDocument['startViewTransition']>

function installStartViewTransition(
    value?: (update: () => void) => ViewTransitionHandle
): void {
    Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        writable: true,
        value: value as ViewTransitionStarter | undefined,
    })
}

function installMatchMedia(matches: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn().mockImplementation(() => ({
            matches,
            media: '',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

function createViewTransitionHandle(): ViewTransitionHandle {
    return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
        types: new Set(),
    }
}

describe('navigationTransition', () => {
    afterEach(() => {
        window.sessionStorage.clear()
    })

    beforeEach(() => {
        vi.resetModules()
        startTransitionMock.mockClear()
        installMatchMedia(false)
        installStartViewTransition()
    })

    it('falls back to startTransition when View Transition is unavailable', async () => {
        const commit = vi.fn()
        const { runNavigationTransition } = await import('./navigationTransition')

        runNavigationTransition(commit, { enableViewTransition: true })

        expect(startTransitionMock).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('reuses the shared default options when no recovery href is provided', async () => {
        const {
            VIEW_TRANSITION_NAVIGATION_OPTIONS,
            createNavigationTransitionOptions
        } = await import('./navigationTransition')

        expect(createNavigationTransitionOptions()).toBe(VIEW_TRANSITION_NAVIGATION_OPTIONS)
    })

    it('creates merged navigation options when a recovery href is provided', async () => {
        const { createNavigationTransitionOptions } = await import('./navigationTransition')

        expect(createNavigationTransitionOptions('/sessions/session-1')).toEqual({
            enableViewTransition: true,
            recoveryHref: '/sessions/session-1'
        })
    })

    it('drops invalid recovery hrefs when creating navigation options', async () => {
        const {
            VIEW_TRANSITION_NAVIGATION_OPTIONS,
            createNavigationTransitionOptions
        } = await import('./navigationTransition')

        expect(createNavigationTransitionOptions('https://bad.example')).toBe(VIEW_TRANSITION_NAVIGATION_OPTIONS)
        expect(createNavigationTransitionOptions('//bad.example')).toBe(VIEW_TRANSITION_NAVIGATION_OPTIONS)
    })

    it('uses document.startViewTransition as a progressive enhancement when available', async () => {
        const startViewTransitionMock = vi.fn((update: () => void) => {
            update()
            return createViewTransitionHandle()
        })
        installStartViewTransition(startViewTransitionMock)

        const commit = vi.fn()
        const { runNavigationTransition } = await import('./navigationTransition')

        runNavigationTransition(commit, { enableViewTransition: true })

        expect(startViewTransitionMock).toHaveBeenCalledTimes(1)
        expect(startTransitionMock).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('disables View Transition when reduced motion is preferred', async () => {
        installMatchMedia(true)
        const startViewTransitionMock = vi.fn((update: () => void) => {
            update()
            return createViewTransitionHandle()
        })
        installStartViewTransition(startViewTransitionMock)

        const commit = vi.fn()
        const { runNavigationTransition } = await import('./navigationTransition')

        runNavigationTransition(commit, { enableViewTransition: true })

        expect(startViewTransitionMock).not.toHaveBeenCalled()
        expect(startTransitionMock).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledTimes(1)
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
        const {
            runNavigationTransitionAfterPreload,
            readPendingNavigationRecoveryHref
        } = await import('./navigationTransition')
        const { consumePendingAppRecovery } = await import('./appRecovery')

        await runNavigationTransitionAfterPreload(
            Promise.reject(new Error('Failed to fetch dynamically imported module')),
            commit,
            { recoveryHref: '/sessions/session-1' }
        )

        expect(commit).toHaveBeenCalledTimes(1)
        expect(consumePendingAppRecovery()).toMatchObject({
            reason: 'vite-preload-error',
            resumeHref: '/sessions/session-1'
        })
        expect(readPendingNavigationRecoveryHref()).toBeNull()
    })

    it('exposes the intended recovery href while preload is still pending', async () => {
        let resolvePreload!: () => void
        const preload = new Promise<void>((resolve) => {
            resolvePreload = resolve
        })
        const commit = vi.fn()
        const {
            runNavigationTransitionAfterPreload,
            readPendingNavigationRecoveryHref
        } = await import('./navigationTransition')

        const task = runNavigationTransitionAfterPreload(preload, commit, {
            recoveryHref: '/sessions/session-1'
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
        const {
            runPreloadedNavigation,
            readPendingNavigationRecoveryHref
        } = await import('./navigationTransition')

        runPreloadedNavigation(preload, commit, '/sessions/session-1/files')

        expect(readPendingNavigationRecoveryHref()).toBe('/sessions/session-1/files')

        resolvePreload()

        await vi.waitFor(() => {
            expect(commit).toHaveBeenCalledTimes(1)
        })
        expect(readPendingNavigationRecoveryHref()).toBeNull()
    })
})
