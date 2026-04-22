import { startTransition } from 'react'
import type { RuntimeAssetFailure } from '@/lib/runtimeAssetFailure'

export const NAVIGATION_TRANSITION_ACTIVE_STATE = 'running'
export const NAVIGATION_TRANSITION_EVENT_NAME = 'viby:navigation-transition-change'
const NAVIGATION_TRANSITION_STATE_ATTRIBUTE = 'data-viby-navigation-transition'
const NAVIGATION_TRANSITION_FALLBACK_RESET_FRAME_COUNT = 2
const NAVIGATION_TRANSITION_FALLBACK_RESET_TIMEOUT_MS = 240

type NavigationTransitionOptions = {
    enableViewTransition?: boolean
    recoveryHref?: string
}

export type PreloadedNavigationTask = (() => Promise<unknown>) | Promise<unknown>

type PendingNavigationRecovery = {
    token: symbol
    href: string
}

type NavigationSourceSnapshot = {
    href: string | null
    visitId: number
}

let hasInstalledNavigationSourceTracking = false
let trackedNavigationHref: string | null = null
let navigationSourceVisitId = 0

function readNavigationSourceLocation(): string | null {
    if (typeof window === 'undefined') {
        return null
    }

    return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function updateNavigationSourceVisit(): void {
    const nextHref = readNavigationSourceLocation()
    if (nextHref === trackedNavigationHref) {
        return
    }

    trackedNavigationHref = nextHref
    navigationSourceVisitId += 1
}

function installNavigationSourceTracking(): void {
    if (typeof window === 'undefined' || hasInstalledNavigationSourceTracking) {
        return
    }

    hasInstalledNavigationSourceTracking = true
    trackedNavigationHref = readNavigationSourceLocation()

    const historyState = window.history
    const originalPushState = historyState.pushState.bind(historyState)
    const originalReplaceState = historyState.replaceState.bind(historyState)

    historyState.pushState = ((...args: Parameters<History['pushState']>) => {
        const result = originalPushState(...args)
        updateNavigationSourceVisit()
        return result
    }) as History['pushState']

    historyState.replaceState = ((...args: Parameters<History['replaceState']>) => {
        const result = originalReplaceState(...args)
        updateNavigationSourceVisit()
        return result
    }) as History['replaceState']

    window.addEventListener('popstate', updateNavigationSourceVisit)
    window.addEventListener('hashchange', updateNavigationSourceVisit)
}

function readNavigationSourceSnapshot(): NavigationSourceSnapshot {
    installNavigationSourceTracking()

    return {
        href: readNavigationSourceLocation(),
        visitId: navigationSourceVisitId,
    }
}

export const VIEW_TRANSITION_NAVIGATION_OPTIONS: Readonly<NavigationTransitionOptions> = {
    enableViewTransition: true,
}

export function createNavigationTransitionOptions(recoveryHref?: string): Readonly<NavigationTransitionOptions> {
    const normalizedRecoveryHref = normalizeRecoveryHref(recoveryHref)
    if (!normalizedRecoveryHref) {
        return VIEW_TRANSITION_NAVIGATION_OPTIONS
    }

    return {
        ...VIEW_TRANSITION_NAVIGATION_OPTIONS,
        recoveryHref: normalizedRecoveryHref,
    }
}

let pendingNavigationRecovery: PendingNavigationRecovery | null = null
let latestPreloadedNavigationToken: symbol | null = null

function toRuntimeAssetFailure(error: unknown): RuntimeAssetFailure {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
        }
    }

    return {}
}

async function recordNavigationPreloadFailureRecovery(error: unknown, recoveryHref?: string): Promise<void> {
    const module = await import('@/lib/runtimeAssetFailure')
    module.recordRuntimeAssetFailureRecovery({
        reason: 'vite-preload-error',
        failure: toRuntimeAssetFailure(error),
        resumeHref: recoveryHref,
    })
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

    window.dispatchEvent(
        new CustomEvent(NAVIGATION_TRANSITION_EVENT_NAME, {
            detail: {
                active,
            },
        })
    )
}

function scheduleFallbackTransitionReset(): void {
    if (typeof window === 'undefined') {
        setNavigationTransitionActive(false)
        return
    }

    let released = false
    let remainingFrames = NAVIGATION_TRANSITION_FALLBACK_RESET_FRAME_COUNT
    const finish = () => {
        if (released) {
            return
        }

        released = true
        window.clearTimeout(timeoutId)
        setNavigationTransitionActive(false)
    }
    const release = () => {
        if (released) {
            return
        }

        remainingFrames -= 1
        if (remainingFrames > 0) {
            window.requestAnimationFrame(release)
            return
        }

        finish()
    }

    const timeoutId = window.setTimeout(finish, NAVIGATION_TRANSITION_FALLBACK_RESET_TIMEOUT_MS)
    window.requestAnimationFrame(release)
}

export function isNavigationTransitionActive(): boolean {
    if (typeof document === 'undefined') {
        return false
    }

    return (
        document.documentElement.getAttribute(NAVIGATION_TRANSITION_STATE_ATTRIBUTE) ===
        NAVIGATION_TRANSITION_ACTIVE_STATE
    )
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
        href: normalizedHref,
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

export function runNavigationTransition(commit: () => void, options: NavigationTransitionOptions = {}): void {
    // TanStack route commits can suspend on lazy/module/data work. Letting the
    // browser own the transition causes desktop navigations to stall with a
    // stuck "running" state and frozen interactions, so this path stays under
    // our single CSS/DOM owner until the router integration is proven safe.
    void options
    setNavigationTransitionActive(true)
    startTransition(commit)
    scheduleFallbackTransitionReset()
}

export async function runNavigationTransitionAfterPreload(
    preload: PreloadedNavigationTask,
    commit: () => void,
    options: NavigationTransitionOptions = {}
): Promise<void> {
    const navigationToken = Symbol('preloaded-navigation')
    latestPreloadedNavigationToken = navigationToken
    const recoveryToken = registerPendingNavigationRecovery(options.recoveryHref)
    const sourceSnapshot = readNavigationSourceSnapshot()

    try {
        await (typeof preload === 'function' ? preload() : preload)
    } catch (error) {
        await recordNavigationPreloadFailureRecovery(error, options.recoveryHref)

        // Preload is only an enhancement. Navigation must still proceed so the
        // target route can surface its own loading or error state honestly.
    } finally {
        clearPendingNavigationRecovery(recoveryToken)
    }

    if (latestPreloadedNavigationToken !== navigationToken) {
        return
    }

    const currentSourceSnapshot = readNavigationSourceSnapshot()
    if (sourceSnapshot.visitId !== currentSourceSnapshot.visitId) {
        return
    }

    if (sourceSnapshot.href !== currentSourceSnapshot.href) {
        return
    }

    runNavigationTransition(commit, options)
}

export function runPreloadedNavigation(
    preload: PreloadedNavigationTask,
    commit: () => void,
    recoveryHref: string
): void {
    void runNavigationTransitionAfterPreload(preload, commit, createNavigationTransitionOptions(recoveryHref))
}
