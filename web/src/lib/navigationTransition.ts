import { startTransition } from 'react'
import {
    recordRuntimeAssetFailureRecovery,
    type RuntimeAssetFailure
} from '@/lib/runtimeAssetRecovery'

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

function canUseViewTransition(): boolean {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return false
    }

    const viewTransitionDocument = document as ViewTransitionDocument
    if (typeof viewTransitionDocument.startViewTransition !== 'function') {
        return false
    }

    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
        viewTransitionDocument.startViewTransition?.(() => {
            startTransition(commit)
        })
        return
    }

    startTransition(commit)
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
        recordRuntimeAssetFailureRecovery({
            reason: 'vite-preload-error',
            failure: toRuntimeAssetFailure(error),
            resumeHref: options.recoveryHref
        })

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
