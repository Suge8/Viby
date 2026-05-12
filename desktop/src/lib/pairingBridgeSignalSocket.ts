import { PAIRING_SIGNAL_PING_INTERVAL_MS, PAIRING_SIGNAL_RECONNECT_DELAY_MS } from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingSessionSnapshot } from '@/types'
import { handlePairingSignalMessage } from './pairingBridgeControllerSupport'
import { PAIRING_STALE_MESSAGE } from './pairingBridgeRecovery'
import { runPairingBridgeTask } from './pairingBridgeRuntimeSupport'

const SIGNAL_RECONNECT_DELAY_MS = PAIRING_SIGNAL_RECONNECT_DELAY_MS
const SIGNAL_PING_INTERVAL_MS = PAIRING_SIGNAL_PING_INTERVAL_MS
const STALE_SIGNAL_CLOSE_REASONS = new Set(['pairing-unavailable', 'unauthorized'])

type SignalSocketControllerOptions = {
    pairing: DesktopPairingSession
    isDisposed: () => boolean
    isSuppressed: () => boolean
    getChannel: () => RTCDataChannel | null
    isChannelHealthy: () => boolean
    getPeer: () => RTCPeerConnection | null
    getPairingSnapshot: () => PairingSessionSnapshot
    setSocket: (socket: WebSocket | null) => void
    getSocket: () => WebSocket | null
    setBridgeState: Parameters<typeof handlePairingSignalMessage>[0]['setBridgeState']
    scheduleReconnect: (message: string) => void
    closeTransport: () => void
    ensureOffer: (activePeer: RTCPeerConnection) => Promise<void>
    rebuildTransport: (message: string) => void
    tryIceRestart: (message: string) => boolean
    getGuestTransportId: () => string | null
    setGuestTransportId: (transportId: string) => void
    resetOfferState: () => void
    schedulePeerRecovery: () => void
    reportAsyncError: (message: string, error: unknown) => void
    addRemoteCandidate: (peer: RTCPeerConnection, candidate: RTCIceCandidateInit) => Promise<void>
    flushRemoteCandidates: (peer: RTCPeerConnection) => Promise<void>
}

function isStaleSignalClose(event: CloseEvent): boolean {
    return event.code === 1008 && STALE_SIGNAL_CLOSE_REASONS.has(event.reason)
}

export function createPairingBridgeSignalSocketController(options: SignalSocketControllerOptions) {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null

    function clearPingTimer(): void {
        if (pingTimer) clearInterval(pingTimer)
        pingTimer = null
    }

    function clearReconnectTimer(): void {
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = null
        clearPingTimer()
    }

    function scheduleSignalReconnect(): void {
        if (options.isDisposed() || reconnectTimer || options.isSuppressed()) {
            return
        }
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (!options.isDisposed() && !options.isSuppressed()) {
                open()
            }
        }, SIGNAL_RECONNECT_DELAY_MS)
    }

    function sendPing(socket: WebSocket): void {
        if (options.getSocket() === socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ pairingId: options.pairing.pairing.id, type: 'ping' }))
        }
    }

    function startPing(socket: WebSocket): void {
        clearPingTimer()
        pingTimer = setInterval(() => sendPing(socket), SIGNAL_PING_INTERVAL_MS)
    }

    function open(): void {
        const socket = new WebSocket(options.pairing.wsUrl)
        options.setSocket(socket)
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ pairingId: options.pairing.pairing.id, type: 'join' }))
            startPing(socket)
        })
        socket.addEventListener('message', (event) => {
            if (options.getSocket() !== socket) return
            runPairingBridgeTask(
                async () => {
                    const activePeer = options.getPeer()
                    if (!activePeer) return
                    await handlePairingSignalMessage({
                        event: event as MessageEvent<string>,
                        activePeer,
                        pairingId: options.pairing.pairing.id,
                        pairingSnapshot: options.getPairingSnapshot(),
                        signalSocket: options.getSocket(),
                        setBridgeState: options.setBridgeState,
                        scheduleReconnect: options.scheduleReconnect,
                        closeTransport: options.closeTransport,
                        ensureOffer: options.ensureOffer,
                        rebuildTransport: options.rebuildTransport,
                        tryIceRestart: options.tryIceRestart,
                        getGuestTransportId: options.getGuestTransportId,
                        setGuestTransportId: options.setGuestTransportId,
                        resetOfferState: options.resetOfferState,
                        schedulePeerRecovery: options.schedulePeerRecovery,
                        getChannel: options.getChannel,
                        isChannelHealthy: options.isChannelHealthy,
                        addRemoteCandidate: options.addRemoteCandidate,
                        flushRemoteCandidates: options.flushRemoteCandidates,
                    })
                },
                {
                    isDisposed: options.isDisposed,
                    onError: (error) => options.reportAsyncError('配对信令处理失败：', error),
                }
            )
        })
        socket.addEventListener('close', (event) => {
            if (options.getSocket() !== socket || options.isDisposed() || options.isSuppressed()) return
            clearPingTimer()
            options.setSocket(null)
            if (isStaleSignalClose(event)) {
                options.setBridgeState({ phase: 'error', message: PAIRING_STALE_MESSAGE })
                options.closeTransport()
                return
            }
            if (options.getChannel()?.readyState === 'open') {
                scheduleSignalReconnect()
                return
            }
            options.scheduleReconnect('配对信令断开，正在重连。')
        })
        socket.addEventListener('error', () => {
            if (!options.isDisposed() && options.getChannel()?.readyState !== 'open') {
                options.setBridgeState({ phase: 'error', message: '配对信令出错。' })
            }
        })
    }

    return { open, clearReconnectTimer }
}
