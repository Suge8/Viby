import { startTransition } from 'react'
import type { RuntimeAssetFailure } from '@/lib/runtimeAssetFailure'

export const NAVIGATION_TRANSITION_ACTIVE_STATE = 'running'
export const NAVIGATION_TRANSITION_EVENT_NAME = 'viby:navigation-transition-change'
const NAVIGATION_TRANSITION_STATE_ATTRIBUTE = 'data-viby-navigation-transition'
const NAVIGATION_TRANSITION_FALLBACK_RESET_FRAME_COUNT = 2
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'
const NARROW_SCREEN_MEDIA_QUERY = '(max-width: 767px)'

type ViewTransitionDocument = Document & {
    startViewTransition?: (update: () => void) => {
        finished: Promise<void>
        ready: Promise<void>
        updateCallbackDone: Promise<void>
    }
}

type NavigationTransitionOptions = {
    enableViewTransition?: boolean
    recoveryHref?: string
}

export type PreloadedNavigationTask = (() => Promise<unknown>) | Promise<unknown>

type PendingNavigationRecovery = {
    token: symbol
    href: string
}

export const VIEW_TRANSITION_NAVIGATION_OPTIONS: Readonly<NavigationTransitionOptions> = {
    enableViewTransition: true,
}

export function createNavigationTransitionOptions(
    recoveryHref?: string
): Readonly<NavigationTransitionOptions> {
    const normalizedRecoveryHref = normalizeRecoveryHref(recoveryHref)
    if (!normalizedRecoveryHref) {
        return VIEW_TRANSITION_NAVIGATION_OPTIONS
    }

    return {
        ...VIEW_TRANSITION_NAVIGATION_OPTIONS,
        recoveryHref: normalizedRecoveryHref
    }
}

let pendingNavigationRecovery: PendingNavigationRecovery | null = null

function toRuntimeAssetFailure(error: unknown): RuntimeAssetFailure {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack
        }
    }

    return {}
}

async function recordNavigationPreloadFailureRecovery(
    error: unknown,
    recoveryHref?: string
): Promise<void> {
    const module = await import('@/lib/runtimeAssetFailure')
    module.recordRuntimeAssetFailureRecovery({
        reason: 'vite-preload-error',
        failure: toRuntimeAssetFailure(error),
        resumeHref: recoveryHref
    })
}

function canUseViewTransition(): boolean {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return false
    }

    const viewTransitionDocument = document as ViewTransitionDocument
    if (typeof viewTransitionDocument.startViewTransition !== 'function') {
        return false
    }

    return !matchesMediaQuery(REDUCED_MOTION_MEDIA_QUERY)
        && !matchesMediaQuery(NARROW_SCREEN_MEDIA_QUERY)
        && !hasEditableFocus()
}

function matchesMediaQuery(query: string): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false
    }

    return window.matchMedia(query).matches
}

function hasEditableFocus(): boolean {
    if (typeof document === 'undefined') {
        return false
    }

    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement)) {
        return false
    }

    if (activeElement.isContentEditable) {
        return true
    }

    return activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
}

function setNavigationTransitionActive(active: boolean): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return
    }

    const root = document.documentElement
    if (active) {
        root.setAttribute(NAVIGATION_TRANSITION_STATE_ATTRIBUTE, NAVIGATION_TRANSITION_ACTIVE_STATE)
    } else {
        root.removeAttribute(NAVIGATION_TRANSITION_STATE_ATTRIBUTE)
    }

    window.dispatchEvent(new CustomEvent(NAVIGATION_TRANSITION_EVENT_NAME, {
        detail: {
            active
        }
    }))
}

function scheduleFallbackTransitionReset(): void {
    if (typeof window === 'undefined') {
        setNavigationTransitionActive(false)
        return
    }

    let remainingFrames = NAVIGATION_TRANSITION_FALLBACK_RESET_FRAME_COUNT
    const release = () => {
        remainingFrames -= 1
        if (remainingFrames > 0) {
            window.requestAnimationFrame(release)
            return
        }

        setNavigationTransitionActive(false)
    }

    window.requestAnimationFrame(release)
}

export function isNavigationTransitionActive(): boolean {
    if (typeof document === 'undefined') {
        return false
    }

    return document.documentElement.getAttribute(NAVIGATION_TRANSITION_STATE_ATTRIBUTE)
        === NAVIGATION_TRANSITION_ACTIVE_STATE
}

function normalizeRecoveryHref(value: string | undefined): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
        return null
    }

    return trimmed
}

function registerPendingNavigationRecovery(href: string | undefined): symbol | null {
    const normalizedHref = normalizeRecoveryHref(href)
    if (!normalizedHref) {
        return null
    }

    const token = Symbol('navigation-recovery')
    pendingNavigationRecovery = {
        token,
        href: normalizedHref
    }
    return token
}

function clearPendingNavigationRecovery(token: symbol | null): void {
    if (!token || pendingNavigationRecovery?.token !== token) {
        return
    }

    pendingNavigationRecovery = null
}

export function readPendingNavigationRecoveryHref(): string | null {
    return pendingNavigationRecovery?.href ?? null
}

export function runNavigationTransition(
    commit: () => void,
    options: NavigationTransitionOptions = {}
): void {
    if (options.enableViewTransition && canUseViewTransition()) {
        const viewTransitionDocument = document as ViewTransitionDocument
        setNavigationTransitionActive(true)
        const transition = viewTransitionDocument.startViewTransition?.(() => {
            startTransition(commit)
        })
        void transition?.finished.finally(() => {
            setNavigationTransitionActive(false)
        })
        return
    }

    setNavigationTransitionActive(true)
    startTransition(commit)
    scheduleFallbackTransitionReset()
}

export async function runNavigationTransitionAfterPreload(
    preload: PreloadedNavigationTask,
    commit: () => void,
    options: NavigationTransitionOptions = {}
): Promise<void> {
    const recoveryToken = registerPendingNavigationRecovery(options.recoveryHref)

    try {
        await (typeof preload === 'function' ? preload() : preload)
    } catch (error) {
        await recordNavigationPreloadFailureRecovery(error, options.recoveryHref)

        // Preload is only an enhancement. Navigation must still proceed so the
        // target route can surface its own loading or error state honestly.
    } finally {
        clearPendingNavigationRecovery(recoveryToken)
    }

    runNavigationTransition(commit, options)
}

export function runPreloadedNavigation(
    preload: PreloadedNavigationTask,
    commit: () => void,
    recoveryHref: string
): void {
    void runNavigationTransitionAfterPreload(
        preload,
        commit,
        createNavigationTransitionOptions(recoveryHref)
    )
}
