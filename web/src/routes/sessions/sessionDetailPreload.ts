import type { PreloadSessionDetailRouteOptions } from './sessionRoutePreload'
import { preloadSessionChatExperience } from './sessionRoutePreload'
import { createSessionDetailQueryOptions } from '@/hooks/queries/sessionDetailQueryOptions'

export async function preloadSessionDetailRoute(
    options: PreloadSessionDetailRouteOptions
): Promise<void> {
    const api = options.api
    const tasks: Promise<unknown>[] = [preloadSessionChatExperience({
        includeWorkspace: options.includeWorkspace !== false
    })]
    const includeLatestMessages = options.includeLatestMessages !== false

    if (api) {
        tasks.push(options.queryClient.prefetchQuery(
            createSessionDetailQueryOptions(api, options.sessionId)
        ))
        if (includeLatestMessages) {
            tasks.push(import('@/lib/message-window-store').then(({ ensureLatestMessagesLoaded }) => {
                return ensureLatestMessagesLoaded(api, options.sessionId)
            }))
        }
    }

    await Promise.all(tasks)
}
