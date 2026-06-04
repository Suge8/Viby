import { classifyFatalPairingClose, type PairingSocketCloseInfo } from './pairingCloseCode'
import { type PairingRtcSignal, PairingTransportSignalSchema } from './pairingSignal'
import {
    computePairingReconnectDelay,
    PAIRING_ICE_DISCONNECTED_RESTART_DELAY_MS,
    PAIRING_ICE_RESTART_MIN_INTERVAL_MS,
} from './pairingTiming'
import type {
    PairingFatalReason,
    PairingPeer,
    PairingSocket,
    PairingTransportHandle,
    PairingTransportOptions,
    PairingTransportState,
    RTCIceServer,
} from './pairingTransportTypes'
import { createPerfectNegotiation } from './perfectNegotiation'

export type {
    PairingFatalReason,
    PairingPeer,
    PairingSocket,
    PairingTransportHandle,
    PairingTransportOptions,
    PairingTransportState,
    RTCDataChannel,
    RTCIceServer,
} from './pairingTransportTypes'

const SOCKET_OPEN = 1
const ICE_RESTART_STATES = new Set(['disconnected', 'failed'])
// `iceCandidatePoolSize > 0` predates the data channel and the m-line; the
// pre-gathered STUN/TURN candidates ship with a placeholder ufrag and the
// host candidates race the mDNS hostname resolver. WebKit (iOS/macOS) and
// Chromium then mix mDNS and IP host candidates across components, so the
// peer ICE check fails and the data channel never opens. The default of 0
// gathers on `setLocalDescription`, when the data channel and ufrag are
// bound to a real m-line; ICE then converges in the normal way.
type DefaultPeerConfig = { bundlePolicy: 'max-bundle'; iceServers: RTCIceServer[] }

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
    function send(signal: PairingRtcSignal) {
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
            let closeInfo: PairingSocketCloseInfo | undefined
            try {
                const url = await options.getWsUrl()
                if (disposed) return
                const nextSocket = (options.socketFactory ?? createDefaultSocket)(url)
                socket = nextSocket
                closeInfo = await bindSocket(nextSocket, () => {
                    flushPendingSignals(nextSocket)
                    attempt = 0
                    if (!isPeerReady()) commitState({ kind: 'connecting', attempt: 0 })
                })
            } catch (_) {}
            if (disposed) return
            // The broker permanently rejects a stale/invalid host token (1008) or
            // a deleted/expired pairing without sending a `bye` frame first; the
            // signaling socket must go terminal instead of reconnect-storming.
            const fatalReason = classifyFatalPairingClose(closeInfo)
            if (fatalReason) return close(fatalReason as PairingFatalReason)
            if (ICE_RESTART_STATES.has(peer.iceConnectionState)) maybeRestartIce()
            attempt += 1
            if (!isPeerReady()) commitState({ kind: 'connecting', attempt })
            await sleep(backoff(attempt))
        }
    }
    function bindSocket(nextSocket: PairingSocket, onOpen: () => void) {
        return new Promise<PairingSocketCloseInfo | undefined>((resolve) => {
            nextSocket.onopen = onOpen
            nextSocket.onerror = () => {}
            nextSocket.onclose = (event) => resolve(event)
            nextSocket.onmessage = (event) => receive(event.data).catch(ignoreReceiveError)
        })
    }
    async function receive(data: string) {
        const raw = parseJson(data)
        if (raw === null) return
        options.onSignalReceived?.(raw)
        const signal = PairingTransportSignalSchema.safeParse(raw)
        if (!signal.success) return
        if (signal.data.type === 'bye') return close(signal.data.reason)
        if (signal.data.type === 'peer-replaced') {
            options.onPeerReplaced?.()
            return
        }
        await negotiation.onSignal(signal.data)
    }
    function requestIceRestart() {
        maybeRestartIce()
    }
    function ignoreReceiveError(): void {}
    function notifyForeground() {
        if (socket?.readyState !== SOCKET_OPEN) return wakeSleep?.()
        if (ICE_RESTART_STATES.has(peer.iceConnectionState)) maybeRestartIce()
    }
    function close(reason: PairingFatalReason) {
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
        if (!canInitiateOffer()) return
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
    function canInitiateOffer(): boolean {
        // Passive peers have no m-line before the host offer arrives. Calling
        // restartIce() there makes WebKit emit an empty SDP, which max-bundle
        // rejects with “session description has no BUNDLE group”.
        return options.createDataChannel || Boolean(peer.localDescription?.sdp || peer.remoteDescription?.sdp)
    }
}

function parseJson(data: string): unknown | null {
    try {
        return JSON.parse(data) as unknown
    } catch {
        return null
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
        iceServers,
    })
}
function createDefaultSocket(url: string) {
    const globalSocket = globalThis as unknown as { WebSocket: new (url: string) => PairingSocket }
    return new globalSocket.WebSocket(url)
}
