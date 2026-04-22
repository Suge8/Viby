import { preloadMarkdownRenderer } from '@/components/markdown/loadMarkdownRenderer'
import { preloadSessionChatWorkspaceSurfaces } from '@/components/sessionChatWorkspaceModules'

let sessionChatRouteModulePromise: Promise<typeof import('@/routes/sessions/chat')> | null = null
let sessionFilesRouteModulePromise: Promise<typeof import('@/routes/sessions/files')> | null = null
let sessionFileRouteModulePromise: Promise<typeof import('@/routes/sessions/file')> | null = null
let sessionTerminalRouteModulePromise: Promise<typeof import('@/routes/sessions/terminal')> | null = null
let newSessionRouteModulePromise: Promise<typeof import('@/routes/sessions/new')> | null = null
let settingsRouteModulePromise: Promise<typeof import('@/routes/settings')> | null = null

export function loadSessionChatRouteModule(): Promise<typeof import('@/routes/sessions/chat')> {
    sessionChatRouteModulePromise ??= import('@/routes/sessions/chat')
    return sessionChatRouteModulePromise
}

export function loadSessionFilesRouteModule(): Promise<typeof import('@/routes/sessions/files')> {
    sessionFilesRouteModulePromise ??= import('@/routes/sessions/files')
    return sessionFilesRouteModulePromise
}

export function loadSessionFileRouteModule(): Promise<typeof import('@/routes/sessions/file')> {
    sessionFileRouteModulePromise ??= import('@/routes/sessions/file')
    return sessionFileRouteModulePromise
}

export function loadSessionTerminalRouteModule(): Promise<typeof import('@/routes/sessions/terminal')> {
    sessionTerminalRouteModulePromise ??= import('@/routes/sessions/terminal')
    return sessionTerminalRouteModulePromise
}

export function loadSessionTerminalViewModule(): Promise<typeof import('@/components/Terminal/TerminalView')> {
    return import('@/components/Terminal/TerminalView')
}

export function loadNewSessionRouteModule(): Promise<typeof import('@/routes/sessions/new')> {
    newSessionRouteModulePromise ??= import('@/routes/sessions/new')
    return newSessionRouteModulePromise
}

export function loadSettingsRouteModule(): Promise<typeof import('@/routes/settings')> {
    settingsRouteModulePromise ??= import('@/routes/settings')
    return settingsRouteModulePromise
}

export async function preloadSessionChatRouteModuleOnly(): Promise<void> {
    await loadSessionChatRouteModule()
}

export async function preloadSessionChatCriticalExperience(options?: { includeWorkspace?: boolean }): Promise<void> {
    // Keep transcript markdown on the same preload path as the ready chat route
    // so first entry does not repaint from plain text into richer markdown.
    const tasks: Promise<unknown>[] = [preloadSessionChatRouteModuleOnly(), preloadMarkdownRenderer()]
    if (options?.includeWorkspace) {
        tasks.push(preloadSessionChatWorkspaceSurfaces())
    }
    await Promise.all(tasks)
}

export async function preloadSessionChatExperience(options?: { includeWorkspace?: boolean }): Promise<void> {
    await preloadSessionChatCriticalExperience(options)
}

export async function preloadSessionTerminalExperience(): Promise<void> {
    await Promise.all([loadSessionTerminalRouteModule(), loadSessionTerminalViewModule()])
}

export const SESSIONS_IDLE_PRELOADERS = [loadNewSessionRouteModule, loadSettingsRouteModule] as const
