import { PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS } from '@viby/protocol'
import type { MutableRefObject } from 'react'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { getRemoteReconnectDelay } from './remotePairingRecovery'

type RemoteReconnectState = { kind: string }

export function shouldGiveUpRemoteReconnect(
    attempt: number,
    maxAttempts = PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS
): boolean {
    return attempt >= maxAttempts
}

export function createRemotePairingReconnectLoop(options: {
    stateRef: MutableRefObject<RemoteReconnectState>
    bootGenerationRef: MutableRefObject<number>
    reconnectAttemptRef: MutableRefObject<number>
    reconnectTimerRef: MutableRefObject<number | null>
    setBooting: () => void
    setReconnecting: () => void
    bumpAttempt: () => void
    onGiveUp: () => void
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

    function forceFreshAttempt(): void {
        clearTimer()
        options.bootGenerationRef.current += 1
        options.reconnectAttemptRef.current = 0
        options.setBooting()
        options.bumpAttempt()
    }

    function scheduleReconnect(): void {
        if (options.stateRef.current.kind === 'reconnecting') return
        clearTimer()
        if (shouldGiveUpRemoteReconnect(options.reconnectAttemptRef.current)) {
            options.reconnectAttemptRef.current = 0
            options.onGiveUp()
            return
        }
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

    return { clearTimer, requestReconnect, forceFreshAttempt, scheduleReconnect, isStale, closeIfStale }
}
