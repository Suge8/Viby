import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'

export type PreloadSessionDetailRouteOptions = {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string
    includeWorkspaceRuntime?: boolean
    recoveryHref?: string
}

type SessionDetailPreloadModule = typeof import('./sessionDetailPreload')

let sessionDetailPreloadModulePromise: Promise<SessionDetailPreloadModule> | null = null

function runSessionDetailBackgroundPreload(
    options: PreloadSessionDetailRouteOptions,
    run: (module: SessionDetailPreloadModule) => Promise<void>
): void {
    void loadSessionDetailPreloadModule(options.recoveryHref)
        .then(run)
        .catch(() => {
            // Best-effort background preloads must never create a second navigation path.
        })
}

async function recordPreloadFailureRecovery(error: unknown, recoveryHref?: string): Promise<void> {
    const failure =
        error instanceof Error
            ? {
                  message: error.message,
                  stack: error.stack,
              }
            : {}

    const module = await import('@/lib/runtimeAssetFailure')
    module.recordRuntimeAssetFailureRecovery({
        reason: 'vite-preload-error',
        failure,
        resumeHref: recoveryHref,
    })
}

async function loadSessionDetailPreloadModule(recoveryHref?: string): Promise<SessionDetailPreloadModule> {
    try {
        sessionDetailPreloadModulePromise ??= import('./sessionDetailPreload')
        return await sessionDetailPreloadModulePromise
    } catch (error) {
        sessionDetailPreloadModulePromise = null
        await recordPreloadFailureRecovery(error, recoveryHref)
        throw error
    }
}

export async function preloadSessionDetailCriticalRoute(options: PreloadSessionDetailRouteOptions): Promise<void> {
    const module = await loadSessionDetailPreloadModule(options.recoveryHref)
    await module.preloadSessionDetailCriticalRoute(options)
}

export async function preloadSessionDetailRoute(options: PreloadSessionDetailRouteOptions): Promise<void> {
    const module = await loadSessionDetailPreloadModule(options.recoveryHref)
    await module.preloadSessionDetailRoute(options)
}

export function warmSessionDetailAncillaryRouteData(options: PreloadSessionDetailRouteOptions): void {
    runSessionDetailBackgroundPreload(options, (module) => module.warmSessionDetailAncillaryData(options))
}

export function preloadSessionDetailIntent(options: PreloadSessionDetailRouteOptions): void {
    runSessionDetailBackgroundPreload(options, (module) => module.preloadSessionDetailIntentRoute(options))
}
