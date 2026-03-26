import type { PreloadSessionDetailRouteOptions } from './sessionDetailRoutePreload'
import { preloadSessionChatExperience } from './sessionRoutePreload'
import { createSessionDetailQueryOptions } from '@/hooks/queries/sessionDetailQueryOptions'

export async function preloadSessionDetailCriticalRoute(
    options: PreloadSessionDetailRouteOptions
): Promise<void> {
    void options
    await preloadSessionChatExperience()
}

export async function warmSessionDetailData(
    options: PreloadSessionDetailRouteOptions
): Promise<void> {
    const api = options.api
    const tasks: Promise<unknown>[] = []
    const includeLatestMessages = options.includeLatestMessages !== false

    if (!api) {
        return
    }

    tasks.push(preloadSessionChatExperience({
        includeWorkspace: true
    }).catch(() => {
        // UI runtime warmup stays best-effort and must never block navigation.
    }))
    tasks.push(options.queryClient.prefetchQuery(
        createSessionDetailQueryOptions(api, options.sessionId)
    ).catch(() => {
        // Data warmup must never block or fork navigation.
    }))
    if (includeLatestMessages) {
        tasks.push(import('@/lib/message-window-store').then(({ ensureLatestMessagesLoaded }) => {
            return ensureLatestMessagesLoaded(api, options.sessionId)
        }).catch(() => {
            // Message warmup is best-effort. The route will reconcile honestly
            // after navigation if this background fetch misses.
        }))
    }

    await Promise.all(tasks)
}

export async function preloadSessionDetailRoute(
    options: PreloadSessionDetailRouteOptions
): Promise<void> {
    await preloadSessionDetailCriticalRoute(options)
    await warmSessionDetailData(options)
}
