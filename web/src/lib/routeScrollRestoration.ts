import type { ParsedLocation } from '@tanstack/react-router'

const SESSION_FILE_ROUTE = /^\/sessions\/[^/]+\/file$/
const SESSION_FILES_ROUTE = /^\/sessions\/[^/]+\/files$/

type RouteSearch = {
    path?: unknown
    staged?: unknown
    tab?: unknown
    mode?: unknown
}

export function getRouteScrollRestorationKey(location: ParsedLocation): string {
    const search = location.search as RouteSearch
    if (SESSION_FILE_ROUTE.test(location.pathname) && typeof search.path === 'string') {
        const staged = search.staged === true ? '&staged=true' : ''
        return `${location.pathname}?path=${search.path}${staged}`
    }
    if (SESSION_FILES_ROUTE.test(location.pathname) && search.tab === 'directories') {
        return `${location.pathname}?tab=directories`
    }
    if (location.pathname === '/sessions/new' && search.mode === 'recover-local') {
        return `${location.pathname}?mode=recover-local`
    }
    return location.pathname
}
