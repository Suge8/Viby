let toolCardViewsModulePromise: Promise<typeof import('@/components/ToolCard/views/_all')> | null = null
let toolCardResultViewsModulePromise: Promise<typeof import('@/components/ToolCard/views/_results')> | null = null

function loadToolCardViewsModule(): Promise<typeof import('@/components/ToolCard/views/_all')> {
    toolCardViewsModulePromise ??= import('@/components/ToolCard/views/_all')
    return toolCardViewsModulePromise
}

function loadToolCardResultViewsModule(): Promise<typeof import('@/components/ToolCard/views/_results')> {
    toolCardResultViewsModulePromise ??= import('@/components/ToolCard/views/_results')
    return toolCardResultViewsModulePromise
}

export async function preloadSessionChatWorkspaceSurfaces(): Promise<void> {
    await Promise.all([loadToolCardViewsModule(), loadToolCardResultViewsModule()])
}
