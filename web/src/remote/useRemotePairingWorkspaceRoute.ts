import { hasPairingWorkspaceIntent, withPairingWorkspaceIdentity } from '@viby/protocol'
import { useEffect } from 'react'

export function useRemotePairingWorkspaceRoute(options: {
    hash: string
    pathname: string
    pairingId: string
    replace(path: string): void
    running: boolean
    search: string
}): void {
    const { hash, pathname, pairingId, replace, running, search } = options
    useEffect(() => {
        if (!running) return
        if (!pathname.startsWith('/sessions')) {
            replace(withPairingWorkspaceIdentity('/sessions', pairingId))
            return
        }
        if (!hasPairingWorkspaceIntent(pathname, search)) {
            replace(withPairingWorkspaceIdentity(`${pathname}${search}${hash}`, pairingId))
        }
    }, [hash, pairingId, pathname, replace, running, search])
}
