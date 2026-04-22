export const SESSIONS_INDEX_ROUTE = '/sessions'
export const NEW_SESSION_ROUTE = '/sessions/new'
export const SETTINGS_ROUTE = '/sessions/settings'

const RESERVED_SESSIONS_CHILD_SEGMENTS = new Set(['new', 'settings'])
const TRAILING_SLASH_RE = /\/+$/
const DIRECT_SESSION_ROUTE_RE = /^\/sessions\/([^/]+)$/
const FILE_ROUTE_SUFFIX = '/file'
const FILES_ROUTE_SUFFIX = '/files'
const DIRECTORIES_TAB = 'directories'

export function normalizeRoutePath(pathname: string): string {
    if (pathname === '/') {
        return pathname
    }

    return pathname.replace(TRAILING_SLASH_RE, '') || '/'
}

export function buildSessionHref(sessionId: string): string {
    return `${SESSIONS_INDEX_ROUTE}/${sessionId}`
}

export function buildSessionFilesPath(sessionId: string): string {
    return `${buildSessionHref(sessionId)}/files`
}

export function buildSessionFilePath(sessionId: string): string {
    return `${buildSessionHref(sessionId)}/file`
}

export function buildSessionFileRecoveryHref(sessionId: string, encodedPath: string): string {
    return `${buildSessionFilePath(sessionId)}?path=${encodeURIComponent(encodedPath)}`
}

export function buildSessionTerminalPath(sessionId: string): string {
    return `${buildSessionHref(sessionId)}/terminal`
}

export function isReservedSessionsChildSegment(segment: string | null | undefined): boolean {
    return typeof segment === 'string' && RESERVED_SESSIONS_CHILD_SEGMENTS.has(segment)
}

export function resolveSessionRouteParam(segment: string | null | undefined): string | null {
    if (!segment || isReservedSessionsChildSegment(segment)) {
        return null
    }

    return segment
}

export function isSessionsIndexPath(pathname: string): boolean {
    return normalizeRoutePath(pathname) === SESSIONS_INDEX_ROUTE
}

export function isSessionsWorkspacePath(pathname: string): boolean {
    const normalizedPath = normalizeRoutePath(pathname)
    return normalizedPath === SESSIONS_INDEX_ROUTE || normalizedPath.startsWith(`${SESSIONS_INDEX_ROUTE}/`)
}

export function resolveDirectSessionIdFromPath(pathname: string): string | null {
    const directSessionMatch = normalizeRoutePath(pathname).match(DIRECT_SESSION_ROUTE_RE)
    if (!directSessionMatch) {
        return null
    }

    return resolveSessionRouteParam(directSessionMatch[1])
}

export function resolveSessionsParentPath(pathname: string): string | null {
    const normalizedPath = normalizeRoutePath(pathname)
    if (!isSessionsWorkspacePath(normalizedPath) || normalizedPath === SESSIONS_INDEX_ROUTE) {
        return null
    }

    if (normalizedPath.endsWith(FILE_ROUTE_SUFFIX)) {
        return normalizedPath.slice(0, -FILE_ROUTE_SUFFIX.length) + FILES_ROUTE_SUFFIX
    }

    return normalizedPath.replace(/\/[^/]+$/, '') || SESSIONS_INDEX_ROUTE
}

export function resolveSessionsParentNavigation(options: {
    pathname: string
    search: unknown
}): { to: string; search?: { tab: 'directories' } } | null {
    const normalizedPath = normalizeRoutePath(options.pathname)
    const parentPath = resolveSessionsParentPath(options.pathname)
    if (!parentPath) {
        return null
    }

    if (normalizedPath.endsWith(FILE_ROUTE_SUFFIX)) {
        const tab =
            options.search && typeof options.search === 'object' && 'tab' in options.search
                ? (options.search as { tab?: unknown }).tab
                : undefined

        return {
            to: parentPath,
            search: tab === DIRECTORIES_TAB ? { tab: DIRECTORIES_TAB } : undefined,
        }
    }

    return { to: parentPath }
}
