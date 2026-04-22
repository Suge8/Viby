import { loadSessionViewRuntime } from '@/hooks/queries/sessionViewRuntime'
import { prefetchCommandCapabilitiesResponse } from './SessionAutocompleteCapabilities'
import type { PreloadSessionDetailRouteOptions } from './sessionDetailRoutePreload'
import { preloadSessionChatCriticalExperience, preloadSessionChatRouteModuleOnly } from './sessionRoutePreload'

export async function preloadSessionDetailCriticalRoute(options: PreloadSessionDetailRouteOptions): Promise<void> {
    const tasks: Promise<unknown>[] = [
        preloadSessionChatCriticalExperience({
            includeWorkspace: options.includeWorkspaceRuntime === true,
        }),
    ]

    if (options.api) {
        tasks.push(
            loadSessionViewRuntime({
                api: options.api,
                queryClient: options.queryClient,
                sessionId: options.sessionId,
            })
        )
    }

    await Promise.all(tasks)
}

export async function preloadSessionDetailIntentRoute(_options: PreloadSessionDetailRouteOptions): Promise<void> {
    await preloadSessionChatRouteModuleOnly()
}

export async function warmSessionDetailAncillaryData(options: PreloadSessionDetailRouteOptions): Promise<void> {
    await prefetchCommandCapabilitiesResponse({
        api: options.api,
        queryClient: options.queryClient,
        sessionId: options.sessionId,
    })
}

export async function preloadSessionDetailRoute(options: PreloadSessionDetailRouteOptions): Promise<void> {
    await preloadSessionDetailCriticalRoute(options)
    await warmSessionDetailAncillaryData(options)
}
