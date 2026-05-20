import { createContext, type ReactNode, useContext } from 'react'

const RemotePairingInteractionBlockedContext = createContext(false)

export function RemotePairingInteractionProvider(props: { blocked: boolean; children: ReactNode }): ReactNode {
    return (
        <RemotePairingInteractionBlockedContext.Provider value={props.blocked}>
            {props.children}
        </RemotePairingInteractionBlockedContext.Provider>
    )
}

export function useRemotePairingInteractionBlocked(): boolean {
    return useContext(RemotePairingInteractionBlockedContext)
}
