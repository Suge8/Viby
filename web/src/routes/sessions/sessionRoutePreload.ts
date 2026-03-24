import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { recordRuntimeAssetFailureRecovery } from '@/lib/runtimeAssetRecovery'

export function loadSessionChatRouteModule(): Promise<typeof import('@/routes/sessions/chat')> {
    return import('@/routes/sessions/chat')
}

export function loadSessionsShellRouteModule(): Promise<typeof import('@/routes/sessions/SessionsShell')> {
    return import('@/routes/sessions/SessionsShell')
}

export function loadSessionChatWorkspaceModule(): Promise<typeof import('@/components/SessionChatWorkspace')> {
    return import('@/components/SessionChatWorkspace')
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

export type PreloadSessionDetailRouteOptions = {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string
    includeWorkspace?: boolean
    includeLatestMessages?: boolean
    recoveryHref?: string
}

export async function preloadSessionDetailRoute(options: PreloadSessionDetailRouteOptions): Promise<void> {
    try {
        const module = await import('./sessionDetailPreload')
        await module.preloadSessionDetailRoute(options)
    } catch (error) {
        const failure = error instanceof Error
            ? {
                message: error.message,
                stack: error.stack
            }
            : {}
        recordRuntimeAssetFailureRecovery({
            reason: 'vite-preload-error',
            failure,
            resumeHref: options.recoveryHref
        })
        throw error
    }
}

export function preloadSessionDetailIntent(
    options: Omit<PreloadSessionDetailRouteOptions, 'includeLatestMessages' | 'includeWorkspace'>
): void {
    void preloadSessionDetailRoute({
        ...options,
        includeLatestMessages: false,
        includeWorkspace: false
    }).catch(() => {
        // Intent preloads are an enhancement only. Failures should not create a
        // second navigation path or block the eventual explicit selection.
    })
}
