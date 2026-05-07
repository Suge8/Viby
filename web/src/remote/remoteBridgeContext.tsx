import { createContext, type ReactNode, useContext } from 'react'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'

const RemotePeerBridgeContext = createContext<RemotePeerBridge | null>(null)

export function RemotePeerBridgeProvider(props: { bridge: RemotePeerBridge; children: ReactNode }) {
    return <RemotePeerBridgeContext.Provider value={props.bridge}>{props.children}</RemotePeerBridgeContext.Provider>
}

export function useRemotePeerBridge(): RemotePeerBridge | null {
    return useContext(RemotePeerBridgeContext)
}
