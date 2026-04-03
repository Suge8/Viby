export function loadSessionChatRuntimeSurfaceModule(): Promise<{
    default: typeof import('@/components/SessionChatRuntimeSurface').SessionChatRuntimeSurface
}> {
    return import('@/components/SessionChatRuntimeSurface').then((module) => ({
        default: module.SessionChatRuntimeSurface
    }))
}

export function loadSessionChatComposerSurfaceModule(): Promise<{
    default: typeof import('@/components/SessionChatComposerSurface').SessionChatComposerSurface
}> {
    return import('@/components/SessionChatComposerSurface').then((module) => ({
        default: module.SessionChatComposerSurface
    }))
}

export async function preloadSessionChatWorkspaceSurfaces(): Promise<void> {
    await Promise.all([
        loadSessionChatRuntimeSurfaceModule(),
        loadSessionChatComposerSurfaceModule()
    ])
}
