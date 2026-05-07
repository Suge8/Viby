import type { MutableRefObject } from 'react'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { getRemoteReconnectDelay } from './remotePairingRecovery'

type RemoteReconnectState = { kind: string }

export function shouldRequestRemoteForegroundReconnect(state: RemoteReconnectState): boolean {
    return state.kind === 'reconnecting'
}

export function createRemotePairingReconnectLoop(options: {
    stateRef: MutableRefObject<RemoteReconnectState>
    bootGenerationRef: MutableRefObject<number>
    reconnectAttemptRef: MutableRefObject<number>
    reconnectTimerRef: MutableRefObject<number | null>
    setBooting: () => void
    setReconnecting: () => void
    bumpAttempt: () => void
}) {
    function clearTimer(): void {
        if (options.reconnectTimerRef.current !== null) {
            window.clearTimeout(options.reconnectTimerRef.current)
            options.reconnectTimerRef.current = null
        }
    }

    function requestReconnect(): void {
        if (options.stateRef.current.kind === 'booting') return
        clearTimer()
        options.bootGenerationRef.current += 1
        options.reconnectAttemptRef.current += 1
        options.setBooting()
        options.bumpAttempt()
    }

    function scheduleReconnect(): void {
        if (options.stateRef.current.kind === 'reconnecting') return
        clearTimer()
        options.setReconnecting()
        options.reconnectTimerRef.current = window.setTimeout(() => {
            options.reconnectTimerRef.current = null
            requestReconnect()
        }, getRemoteReconnectDelay(options.reconnectAttemptRef.current))
    }

    function isStale(disposed: boolean, generation: number): boolean {
        return disposed || generation !== options.bootGenerationRef.current
    }

    function closeIfStale(bridge: RemotePeerBridge, disposed: boolean, generation: number): boolean {
        if (!isStale(disposed, generation)) return false
        bridge.close()
        return true
    }

    return { clearTimer, requestReconnect, scheduleReconnect, isStale, closeIfStale }
}
