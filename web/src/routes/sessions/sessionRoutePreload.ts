let sessionsShellModulePromise: Promise<typeof import('@/routes/sessions/SessionsShell')> | null = null
let sessionChatRouteModulePromise: Promise<typeof import('@/routes/sessions/chat')> | null = null
let sessionChatWorkspaceModulePromise: Promise<typeof import('@/components/SessionChatWorkspace')> | null = null
let sessionChatWorkspaceSurfacesModulePromise: Promise<typeof import('@/components/sessionChatWorkspaceModules')> | null = null

function loadSessionsShellModule(): Promise<typeof import('@/routes/sessions/SessionsShell')> {
    sessionsShellModulePromise ??= import('@/routes/sessions/SessionsShell')
    return sessionsShellModulePromise
}

export async function loadSessionsShellRouteModule(): Promise<{ default: typeof import('@/routes/sessions/SessionsShell').SessionsShell }> {
    const module = await loadSessionsShellModule()
    return { default: module.SessionsShell }
}

export async function loadSessionsIndexRouteModule(): Promise<{ default: typeof import('@/routes/sessions/SessionsShell').SessionsIndexPage }> {
    const module = await loadSessionsShellModule()
    return { default: module.SessionsIndexPage }
}

export function loadSessionChatRouteModule(): Promise<typeof import('@/routes/sessions/chat')> {
    sessionChatRouteModulePromise ??= import('@/routes/sessions/chat')
    return sessionChatRouteModulePromise
}

export function loadSessionChatWorkspaceModule(): Promise<typeof import('@/components/SessionChatWorkspace')> {
    sessionChatWorkspaceModulePromise ??= import('@/components/SessionChatWorkspace')
    return sessionChatWorkspaceModulePromise
}

function loadSessionChatWorkspaceSurfacesModule(): Promise<typeof import('@/components/sessionChatWorkspaceModules')> {
    sessionChatWorkspaceSurfacesModulePromise ??= import('@/components/sessionChatWorkspaceModules')
    return sessionChatWorkspaceSurfacesModulePromise
}

export function loadSessionFilesRouteModule(): Promise<typeof import('@/routes/sessions/files')> {
    return import('@/routes/sessions/files')
}

export function loadSessionFileRouteModule(): Promise<typeof import('@/routes/sessions/file')> {
    return import('@/routes/sessions/file')
}

export function loadSessionTerminalRouteModule(): Promise<typeof import('@/routes/sessions/terminal')> {
    return import('@/routes/sessions/terminal')
}

export function loadSessionTerminalViewModule(): Promise<typeof import('@/components/Terminal/TerminalView')> {
    return import('@/components/Terminal/TerminalView')
}

export function loadNewSessionRouteModule(): Promise<typeof import('@/routes/sessions/new')> {
    return import('@/routes/sessions/new')
}

export function loadSettingsRouteModule(): Promise<typeof import('@/routes/settings')> {
    return import('@/routes/settings')
}

export async function preloadSessionChatExperience(options?: {
    includeWorkspace?: boolean
}): Promise<void> {
    const tasks: Promise<unknown>[] = [loadSessionChatRouteModule()]
    if (options?.includeWorkspace) {
        tasks.push(loadSessionChatWorkspaceModule())
        tasks.push(loadSessionChatWorkspaceSurfacesModule().then((module) => {
            return module.preloadSessionChatWorkspaceSurfaces()
        }))
    }
    await Promise.all(tasks)
}

export async function preloadSessionTerminalExperience(): Promise<void> {
    await Promise.all([
        loadSessionTerminalRouteModule(),
        loadSessionTerminalViewModule()
    ])
}

export const SESSIONS_IDLE_PRELOADERS = [
    loadNewSessionRouteModule,
    loadSettingsRouteModule,
] as const
