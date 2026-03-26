import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'

export type PreloadSessionDetailRouteOptions = {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string
    includeLatestMessages?: boolean
    recoveryHref?: string
}

type SessionDetailPreloadModule = typeof import('./sessionDetailPreload')

let sessionDetailPreloadModulePromise: Promise<SessionDetailPreloadModule> | null = null

async function recordPreloadFailureRecovery(
    error: unknown,
    recoveryHref?: string
): Promise<void> {
    const failure = error instanceof Error
        ? {
            message: error.message,
            stack: error.stack
        }
        : {}

    const module = await import('@/lib/runtimeAssetFailure')
    module.recordRuntimeAssetFailureRecovery({
        reason: 'vite-preload-error',
        failure,
        resumeHref: recoveryHref
    })
}

async function loadSessionDetailPreloadModule(
    recoveryHref?: string
): Promise<SessionDetailPreloadModule> {
    try {
        sessionDetailPreloadModulePromise ??= import('./sessionDetailPreload')
        return await sessionDetailPreloadModulePromise
    } catch (error) {
        sessionDetailPreloadModulePromise = null
        await recordPreloadFailureRecovery(error, recoveryHref)
        throw error
    }
}

export async function preloadSessionDetailCriticalRoute(
    options: PreloadSessionDetailRouteOptions
): Promise<void> {
    const module = await loadSessionDetailPreloadModule(options.recoveryHref)
    await module.preloadSessionDetailCriticalRoute(options)
}

export async function preloadSessionDetailRoute(
    options: PreloadSessionDetailRouteOptions
): Promise<void> {
    const module = await loadSessionDetailPreloadModule(options.recoveryHref)
    await module.preloadSessionDetailRoute(options)
}

export function warmSessionDetailRouteData(
    options: PreloadSessionDetailRouteOptions
): void {
    void loadSessionDetailPreloadModule(options.recoveryHref)
        .then((module) => module.warmSessionDetailData(options))
        .catch(() => {
            // Import failures were already recorded above. Warmup remains
            // best-effort and must not create a second navigation path.
        })
}

export function preloadSessionDetailIntent(
    options: Omit<PreloadSessionDetailRouteOptions, 'includeLatestMessages'>
): void {
    void preloadSessionDetailRoute({
        ...options,
        includeLatestMessages: false
    }).catch(() => {
        // Intent preloads are an enhancement only. Failures should not create a
        // second navigation path or block the eventual explicit selection.
    })
}
