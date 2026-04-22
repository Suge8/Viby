export type MarkdownRendererModule = typeof import('@/components/MarkdownRenderer')

let markdownRendererModulePromise: Promise<MarkdownRendererModule> | null = null
let markdownRendererModule: MarkdownRendererModule | null = null

export function loadMarkdownRendererModule(): Promise<MarkdownRendererModule> {
    markdownRendererModulePromise ??= import('@/components/MarkdownRenderer').then((module) => {
        markdownRendererModule = module
        return module
    })
    return markdownRendererModulePromise
}

export function getLoadedMarkdownRendererModule(): MarkdownRendererModule | null {
    return markdownRendererModule
}

export async function preloadMarkdownRenderer(): Promise<void> {
    await loadMarkdownRendererModule()
}
