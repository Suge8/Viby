export const PAIRING_WORKSPACE_INTENT_PARAM = 'remote'
export const PAIRING_WORKSPACE_INTENT_VALUE = '1'
export const PAIRING_PWA_HANDOFF_PARAM = 'handoff'
export const PAIRING_PWA_MANIFEST_PAIRING_PARAM = 'pairing'
export const PAIRING_NAKED_WORKSPACE_REDIRECT_URL = 'https://viby.run'

export function isPairingWorkspacePath(pathname: string): boolean {
    return pathname === '/sessions' || pathname.startsWith('/sessions/')
}

export function hasPairingWorkspaceIntent(pathname: string, search: string): boolean {
    if (!isPairingWorkspacePath(pathname)) return false
    return readSearchParamCaseInsensitive(search, PAIRING_WORKSPACE_INTENT_PARAM) === PAIRING_WORKSPACE_INTENT_VALUE
}

export function withPairingWorkspaceIntent(href: string): string {
    const hashStart = href.indexOf('#')
    const head = hashStart === -1 ? href : href.slice(0, hashStart)
    const hash = hashStart === -1 ? '' : href.slice(hashStart)
    const queryStart = head.indexOf('?')
    const pathname = queryStart === -1 ? head : head.slice(0, queryStart)
    if (!isPairingWorkspacePath(pathname)) return href
    const params = new URLSearchParams(queryStart === -1 ? '' : head.slice(queryStart + 1))
    deleteSearchParamCaseInsensitive(params, PAIRING_WORKSPACE_INTENT_PARAM)
    params.set(PAIRING_WORKSPACE_INTENT_PARAM, PAIRING_WORKSPACE_INTENT_VALUE)
    return `${pathname}?${params.toString()}${hash}`
}

function readSearchParamCaseInsensitive(search: string, name: string): string | null {
    const target = name.toLowerCase()
    for (const [key, value] of new URLSearchParams(search)) {
        if (key.toLowerCase() === target) return value
    }
    return null
}

function deleteSearchParamCaseInsensitive(params: URLSearchParams, name: string): void {
    const target = name.toLowerCase()
    for (const key of Array.from(params.keys())) {
        if (key.toLowerCase() === target) params.delete(key)
    }
}
