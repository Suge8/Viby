import { createPerfectNegotiation, type RTCPeerConnection as NegotiationPeer } from './perfectNegotiation'
import { PairingSignalV2Schema, type PairingByeReason, type PairingSignalV2 } from './pairingSignal'

const SOCKET_OPEN = 1
const BASE_BACKOFF_MS = 300
const MAX_BACKOFF_MS = 10_000
const ICE_RESTART_STATES = new Set(['disconnected', 'failed'])

export type PairingTransportState = { kind: 'connecting'; attempt: number } | { kind: 'ready' } | { kind: 'fatal'; reason: PairingByeReason | 'closed' }
export interface RTCIceServer { urls: string | string[]; username?: string; credential?: string }
export interface RTCDataChannel { readyState?: string }
export interface PairingSocket {
    readyState: number
    onopen: (() => void) | null
    onclose: (() => void) | null
    onerror: (() => void) | null
    onmessage: ((event: { data: string }) => void) | null
    send(data: string): void
    close(): void
}
export interface PairingPeer extends NegotiationPeer {
    iceConnectionState: string
    connectionState: string
    onicecandidate: ((event: { candidate: PairingSignalV2 extends { type: 'candidate'; candidate: infer C } ? C | null : never }) => void) | null
    onconnectionstatechange: (() => void) | null
    oniceconnectionstatechange: (() => void) | null
    ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null
    createDataChannel(label: string, options: { ordered: boolean }): RTCDataChannel
    restartIce(): void
    close(): void
}
export interface PairingTransportOptions {
    pairingId: string
    polite: boolean
    iceServers: RTCIceServer[]
    getWsUrl(): Promise<string>
    createDataChannel: boolean
    onChannel(channel: RTCDataChannel): void
    onSignalReceived?: (raw: unknown) => void
    socketFactory?: (url: string) => PairingSocket
    peerFactory?: (iceServers: RTCIceServer[]) => PairingPeer
    now?: () => number
    randomJitter?: () => number
}
export interface PairingTransportHandle {
    dispose(): void
    requestIceRestart(): void
    untilReady(): Promise<void>
    notifyForeground(): void
    subscribe(listener: () => void): () => void
    getSnapshot(): PairingTransportState
    getPeer(): PairingPeer
}

export function createPairingTransport(options: PairingTransportOptions): PairingTransportHandle {
    const peer = (options.peerFactory ?? createDefaultPeer)(options.iceServers)
    let state: PairingTransportState = { kind: 'connecting', attempt: 0 }
    let disposed = false
    let socket: PairingSocket | null = null
    let wakeSleep: (() => void) | null = null
    let readyPromise: Promise<void> | null = null
    let resolveReady: (() => void) | null = null
    let rejectReady: ((error: Error) => void) | null = null
    const listeners = new Set<() => void>()
    const negotiation = createPerfectNegotiation({ peer, polite: options.polite, send })
    if (options.createDataChannel) options.onChannel(peer.createDataChannel('control', { ordered: true }))
    else peer.ondatachannel = (event) => options.onChannel(event.channel)
    peer.onicecandidate = (event) => event.candidate && send({ type: 'candidate', candidate: event.candidate })
    peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') commitState({ kind: 'ready' })
        if (peer.connectionState === 'closed') close('closed')
    }
    peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === 'failed') peer.restartIce()
    }
    void connectLoop()
    return { dispose: () => close('closed'), requestIceRestart, untilReady, notifyForeground, subscribe, getSnapshot: () => state, getPeer: () => peer }

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
        if (socket?.readyState === SOCKET_OPEN) socket.send(JSON.stringify(signal))
    }
    async function connectLoop() {
        let attempt = 0
        while (!disposed) {
            try {
                const url = await options.getWsUrl()
                if (disposed) return
                socket = (options.socketFactory ?? createDefaultSocket)(url)
                await bindSocket(socket, () => { attempt = 0; commitState({ kind: 'connecting', attempt: 0 }) })
            } catch (_) {}
            if (disposed) return
            if (ICE_RESTART_STATES.has(peer.iceConnectionState)) peer.restartIce()
            attempt += 1
            commitState({ kind: 'connecting', attempt })
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
        if (peer.connectionState !== 'closed') peer.restartIce()
    }
    function notifyForeground() {
        if (socket?.readyState !== SOCKET_OPEN) return wakeSleep?.()
        if (ICE_RESTART_STATES.has(peer.iceConnectionState)) peer.restartIce()
    }
    function close(reason: PairingByeReason | 'closed') {
        if (disposed) return
        disposed = true
        wakeSleep?.()
        socket?.close()
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
        const jitter = options.randomJitter?.() ?? Math.random() * 0.3 - 0.15
        return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS) * (1 + jitter)
    }
}

function sameState(left: PairingTransportState, right: PairingTransportState) {
    return left.kind === right.kind && ('attempt' in left ? left.attempt === (right as { attempt?: number }).attempt : true) && ('reason' in left ? left.reason === (right as { reason?: string }).reason : true)
}
function createDefaultPeer(iceServers: RTCIceServer[]) {
    const globalPeer = globalThis as unknown as { RTCPeerConnection: new (config: { iceServers: RTCIceServer[] }) => PairingPeer }
    return new globalPeer.RTCPeerConnection({ iceServers })
}
function createDefaultSocket(url: string) {
    const globalSocket = globalThis as unknown as { WebSocket: new (url: string) => PairingSocket }
    return new globalSocket.WebSocket(url)
}
