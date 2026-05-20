import { type PairingByeReason, type PairingSignalV2, PairingSignalV2Schema } from './pairingSignal'
import {
    computePairingReconnectDelay,
    PAIRING_ICE_DISCONNECTED_RESTART_DELAY_MS,
    PAIRING_ICE_RESTART_MIN_INTERVAL_MS,
} from './pairingTiming'
import type {
    PairingPeer,
    PairingSocket,
    PairingTransportHandle,
    PairingTransportOptions,
    PairingTransportState,
    RTCIceServer,
} from './pairingTransportTypes'
import { createPerfectNegotiation } from './perfectNegotiation'

export type {
    PairingPeer,
    PairingSocket,
    PairingTransportHandle,
    PairingTransportOptions,
    PairingTransportState,
    RTCDataChannel,
    RTCIceServer,
} from './pairingTransportTypes'

const SOCKET_OPEN = 1,
    ICE_CANDIDATE_POOL_SIZE = 4
const ICE_RESTART_STATES = new Set(['disconnected', 'failed'])
type DefaultPeerConfig = { bundlePolicy: 'max-bundle'; iceCandidatePoolSize: number; iceServers: RTCIceServer[] }

export function createPairingTransport(options: PairingTransportOptions): PairingTransportHandle {
    const peer = (options.peerFactory ?? createDefaultPeer)(options.iceServers)
    let state: PairingTransportState = { kind: 'connecting', attempt: 0 }
    let disposed = false
    let socket: PairingSocket | null = null
    const pendingSignals: string[] = []
    const now = options.now ?? Date.now
    let lastIceRestartAt = -Infinity
    let wakeSleep: (() => void) | null = null
    let readyPromise: Promise<void> | null = null
    let resolveReady: (() => void) | null = null
    let rejectReady: ((error: Error) => void) | null = null
    const listeners = new Set<() => void>()
    let disconnectedRestartTimer: ReturnType<typeof setTimeout> | null = null
    const negotiation = createPerfectNegotiation({ peer, polite: options.polite, send })
    if (options.createDataChannel) options.onChannel(peer.createDataChannel('control', { ordered: true }))
    else peer.ondatachannel = (event) => options.onChannel(event.channel)
    peer.onicecandidate = (event) => event.candidate && send({ type: 'candidate', candidate: event.candidate })
    peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') commitState({ kind: 'ready' })
        if (peer.connectionState === 'closed') close('closed')
    }
    peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === 'failed') {
            maybeRestartIce()
            return
        }
        if (peer.iceConnectionState === 'disconnected') scheduleDisconnectedRestart()
        else clearDisconnectedRestart()
    }
    void connectLoop()
    return {
        dispose: () => close('closed'),
        requestIceRestart,
        untilReady,
        notifyForeground,
        subscribe,
        getSnapshot: () => state,
        getPeer: () => peer,
    }

    function commitState(next: PairingTransportState) {
        if (sameState(state, next)) return
        state = next
        if (next.kind === 'ready') resolveReady?.()
        if (next.kind === 'fatal') rejectReady?.(new Error(next.reason))
        for (const listener of listeners) listener()
    }
    function subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }
    function untilReady() {
        if (state.kind === 'ready') return Promise.resolve()
        if (state.kind === 'fatal') return Promise.reject(new Error(state.reason))
        readyPromise ??= new Promise<void>((resolve, reject) => {
            resolveReady = resolve
            rejectReady = reject
        })
        return readyPromise
    }
    function send(signal: PairingSignalV2) {
        const payload = JSON.stringify(signal)
        if (socket?.readyState === SOCKET_OPEN) {
            socket.send(payload)
            return
        }
        pendingSignals.push(payload)
    }
    async function connectLoop() {
        let attempt = 0
        while (!disposed) {
            try {
                const url = await options.getWsUrl()
                if (disposed) return
                const nextSocket = (options.socketFactory ?? createDefaultSocket)(url)
                socket = nextSocket
                await bindSocket(nextSocket, () => {
                    flushPendingSignals(nextSocket)
                    attempt = 0
                    if (!isPeerReady()) commitState({ kind: 'connecting', attempt: 0 })
                })
            } catch (_) {}
            if (disposed) return
            if (ICE_RESTART_STATES.has(peer.iceConnectionState)) maybeRestartIce()
            attempt += 1
            if (!isPeerReady()) commitState({ kind: 'connecting', attempt })
            await sleep(backoff(attempt))
        }
    }
    function bindSocket(nextSocket: PairingSocket, onOpen: () => void) {
        return new Promise<void>((resolve) => {
            nextSocket.onopen = onOpen
            nextSocket.onerror = () => {}
            nextSocket.onclose = resolve
            nextSocket.onmessage = (event) => void receive(event.data)
        })
    }
    async function receive(data: string) {
        const raw = JSON.parse(data) as unknown
        options.onSignalReceived?.(raw)
        const signal = PairingSignalV2Schema.parse(raw)
        if (signal.type === 'bye') return close(signal.reason)
        await negotiation.onSignal(signal)
    }
    function requestIceRestart() {
        maybeRestartIce()
    }
    function notifyForeground() {
        if (socket?.readyState !== SOCKET_OPEN) return wakeSleep?.()
        if (ICE_RESTART_STATES.has(peer.iceConnectionState)) maybeRestartIce()
    }
    function close(reason: PairingByeReason | 'closed') {
        if (disposed) return
        disposed = true
        wakeSleep?.()
        clearDisconnectedRestart()
        socket?.close()
        pendingSignals.length = 0
        peer.close()
        negotiation.dispose()
        commitState({ kind: 'fatal', reason })
        listeners.clear()
    }
    function sleep(ms: number) {
        return new Promise<void>((resolve) => {
            const timer = setTimeout(done, ms)
            wakeSleep = done
            function done() {
                clearTimeout(timer)
                wakeSleep = null
                resolve()
            }
        })
    }
    function backoff(attempt: number) {
        return computePairingReconnectDelay(attempt, options.randomJitter)
    }
    function isPeerReady() {
        return peer.connectionState === 'connected'
    }

    function flushPendingSignals(target: PairingSocket) {
        if (pendingSignals.length === 0) return
        if (target.readyState !== SOCKET_OPEN) return
        for (const payload of pendingSignals) target.send(payload)
        pendingSignals.length = 0
    }

    function maybeRestartIce(): void {
        if (peer.connectionState === 'closed') return
        const at = now()
        const elapsedMs = at - lastIceRestartAt
        if (elapsedMs < PAIRING_ICE_RESTART_MIN_INTERVAL_MS) {
            clearDisconnectedRestart()
            if (peer.iceConnectionState === 'disconnected') {
                scheduleDisconnectedRestart(PAIRING_ICE_RESTART_MIN_INTERVAL_MS - elapsedMs)
            }
            return
        }
        clearDisconnectedRestart()
        lastIceRestartAt = at
        peer.restartIce()
    }
    function scheduleDisconnectedRestart(delayMs = PAIRING_ICE_DISCONNECTED_RESTART_DELAY_MS): void {
        if (disconnectedRestartTimer) return
        disconnectedRestartTimer = setTimeout(() => {
            disconnectedRestartTimer = null
            if (peer.iceConnectionState === 'disconnected') maybeRestartIce()
        }, delayMs)
    }
    function clearDisconnectedRestart(): void {
        if (!disconnectedRestartTimer) return
        clearTimeout(disconnectedRestartTimer)
        disconnectedRestartTimer = null
    }
}

function sameState(left: PairingTransportState, right: PairingTransportState) {
    return (
        left.kind === right.kind &&
        ('attempt' in left ? left.attempt === (right as { attempt?: number }).attempt : true) &&
        ('reason' in left ? left.reason === (right as { reason?: string }).reason : true)
    )
}
function createDefaultPeer(iceServers: RTCIceServer[]) {
    const globalPeer = globalThis as unknown as {
        RTCPeerConnection: new (config: DefaultPeerConfig) => PairingPeer
    }
    return new globalPeer.RTCPeerConnection({
        bundlePolicy: 'max-bundle',
        iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE,
        iceServers,
    })
}
function createDefaultSocket(url: string) {
    const globalSocket = globalThis as unknown as { WebSocket: new (url: string) => PairingSocket }
    return new globalSocket.WebSocket(url)
}
