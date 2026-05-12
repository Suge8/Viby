import type {
    PairingIceServer,
    PairingPeerRequest,
    PairingPeerTerminalEventPayload,
    PairingSignal,
} from '@viby/protocol'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import type { SyncEvent } from '@/types/api'
import { uploadRemoteFile } from './remotePairingBinaryUpload'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { handleRemotePeerChannelMessage } from './remotePairingChannelMessages'
import { createRemotePairingDataChannelHealth } from './remotePairingDataChannelHealth'
import { createRemotePairingCodedError } from './remotePairingErrors'
import { createRemoteForegroundSignalAck } from './remotePairingForegroundSignalAck'
import { createRemotePairingLivenessProbe } from './remotePairingLivenessProbe'
import { createRemotePairingNegotiation } from './remotePairingNegotiation'
import { createPeerDisconnectGrace } from './remotePairingPeerDisconnect'
import { createRemotePeerPendingRequests } from './remotePairingPendingRequests'
import {
    buildTimeoutError,
    CONNECT_TIMEOUT_MS,
    hasRelayIceServer,
    RemotePeerConnectError,
    serializeSignal,
} from './remotePairingSignal'
import { createRemotePairingSignalTimers } from './remotePairingSignalTimers'
import { readRemotePeerTransportStats } from './remotePairingStats'
import { createRemotePeerTransportBridge } from './remotePairingTransportBridge'
import { buildTransportSocketUrl, createRemoteTransportId } from './remotePairingTransportSupport'
export type RemotePeerConnectOptions = { pairingId: string; wsUrl: string; iceServers: PairingIceServer[] }

function createFastIcePeer(iceServers: PairingIceServer[]): RTCPeerConnection {
    return new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4, bundlePolicy: 'max-bundle' })
}
function tryRestartIce(peer: RTCPeerConnection): void {
    if (peer.connectionState === 'closed' || peer.connectionState === 'new') return
    if (typeof peer.restartIce !== 'function') return
    try {
        peer.restartIce()
    } catch {}
}

export async function connectRemotePeer(options: RemotePeerConnectOptions): Promise<RemotePeerBridge> {
    const peer = createFastIcePeer(options.iceServers)
    const transportId = createRemoteTransportId()
    const listeners = new Set<(event: SyncEvent) => void>()
    const terminalListeners = new Set<(event: PairingPeerTerminalEventPayload) => void>()
    const closeListeners = new Set<(error: Error) => void>()
    const pendingRequests = createRemotePeerPendingRequests({
        onTransportFailure: () =>
            emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying')),
    })
    let socket: WebSocket | null = null
    let dataChannel: RTCDataChannel | null = null
    let foregroundSignalAck: ReturnType<typeof createRemoteForegroundSignalAck> | null = null
    let signalTimers: ReturnType<typeof createRemotePairingSignalTimers> | null = null
    let closedByClient = false
    let openedChannel = false
    let receivedOffer = false
    let readySettled = false
    let closeEmitted = false
    let closedError: Error | null = null
    let signalMessageQueue = Promise.resolve()
    let removeWakeListeners = (): void => {}
    const relayAvailable = hasRelayIceServer(options.iceServers)
    const peerDisconnectGrace = createPeerDisconnectGrace({
        getConnectionState: () => peer.connectionState,
        onExpired: () => emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying')),
    })
    const livenessProbe = createRemotePairingLivenessProbe({
        onStale: () => emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying')),
    })
    const dataChannelHealth = createRemotePairingDataChannelHealth({
        getChannel: () => dataChannel,
        onStale: () => emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying')),
    })

    function emitRemoteClose(error: Error): void {
        if (closedByClient || closeEmitted) return
        peerDisconnectGrace.clear()
        dataChannelHealth.stop()
        livenessProbe.dispose()
        closeEmitted = true
        closedError = error
        pendingRequests.rejectAll(error)
        for (const listener of closeListeners) {
            listener(error)
        }
    }
    function sendSignal(signal: Omit<PairingSignal, 'pairingId'>): void {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(serializeSignal(signal, options.pairingId))
        }
    }
    function stopSignalTimers(): void {
        signalTimers?.clear()
        foregroundSignalAck?.clear()
    }
    function requestPeer<T>(request: PairingPeerRequest, parse: (value: unknown) => T): Promise<T> {
        dataChannelHealth.sendHeartbeat()
        return pendingRequests.request(dataChannel, request, parse)
    }
    function uploadFile(sessionId: string, file: File, mimeType: string) {
        return uploadRemoteFile({ channel: dataChannel, requestPeer, sessionId, file, mimeType })
    }
    const ready = new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(
            () => finish(() => reject(buildTimeoutError(receivedOffer, relayAvailable))),
            CONNECT_TIMEOUT_MS
        )
        const finish = (action: () => void): void => {
            if (readySettled) return
            readySettled = true
            window.clearTimeout(timeoutId)
            action()
        }
        foregroundSignalAck = createRemoteForegroundSignalAck({
            getSocket: () => socket,
            replaceSocket: (activeSocket) => {
                socket = null
                openSignalSocket()
                activeSocket.close()
            },
        })

        function sendJoin(): void {
            sendSignal({ type: 'join', payload: { transportId } })
        }
        signalTimers = createRemotePairingSignalTimers({
            openSignalSocket,
            sendPing: () => sendSignal({ type: 'ping' }),
            shouldReconnect: () => !closedByClient,
        })
        function openSignalSocketNow(): void {
            if (closedByClient || socket?.readyState === WebSocket.OPEN) return
            const staleSocket = socket?.readyState === WebSocket.CONNECTING ? socket : null
            signalTimers?.clearReconnect()
            if (staleSocket) socket = null
            openSignalSocket()
            staleSocket?.close()
        }
        function handleSignalClose(): void {
            if (!openedChannel) {
                finish(() => reject(new RemotePeerConnectError('closed', 'remotePairing.error.closedScanAgain')))
                return
            }
            signalTimers?.scheduleReconnect()
        }

        function probeDataChannel(): void {
            dataChannelHealth.sendHeartbeat()
        }

        // iOS freezes WebRTC in background; stale NAT mappings make the
        // normal liveness window (~4s probe + 8-15s peer grace) too slow.
        // Kick ICE restart up front so a healthy DTLS session resumes in 1-3s.
        function handlePageWake(): void {
            if (closedByClient || !openedChannel) return
            if (socket?.readyState === WebSocket.OPEN) {
                sendJoin()
                foregroundSignalAck?.arm(socket)
            } else {
                openSignalSocketNow()
            }
            if (readySettled && dataChannel?.readyState !== 'open') {
                emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying'))
                return
            }
            if (readySettled) tryRestartIce(peer)
            if (readySettled) {
                probeDataChannel()
                livenessProbe.arm()
            }
        }
        function openSignalSocket(): void {
            const nextSocket = new WebSocket(buildTransportSocketUrl(options.wsUrl, transportId))
            socket = nextSocket

            nextSocket.addEventListener('open', () => {
                if (socket !== nextSocket) return
                sendJoin()
                signalTimers?.startPing()
            })

            nextSocket.addEventListener('message', (event) => {
                if (socket !== nextSocket) return
                foregroundSignalAck?.clear()
                livenessProbe.noteInbound()
                signalMessageQueue = signalMessageQueue
                    .then(() => handleSignalMessage(event))
                    .catch(handleSignalMessageError)
            })

            nextSocket.addEventListener('close', () => {
                if (socket !== nextSocket) return
                signalTimers?.clearPing()
                foregroundSignalAck?.clear()
                handleSignalClose()
            })

            nextSocket.addEventListener('error', () => {
                if (!openedChannel) {
                    finish(() => reject(new RemotePeerConnectError('socket', 'remotePairing.error.socket')))
                }
            })
        }

        const negotiation = createRemotePairingNegotiation({ peer, sendSignal })
        async function handleSignalMessage(event: MessageEvent): Promise<void> {
            let signal: PairingSignal
            try {
                signal = JSON.parse(String(event.data)) as PairingSignal
            } catch {
                return
            }
            if (signal.pairingId !== options.pairingId) return
            if (signal.type === 'offer') {
                receivedOffer = true
                await negotiation.answerOffer(signal.payload)
                return
            }
            if (signal.type === 'candidate') {
                await negotiation.addCandidatePayload(signal.payload)
                return
            }
            if (signal.type === 'expire') {
                finish(() => reject(new RemotePeerConnectError('expired', 'remotePairing.error.expired')))
            }
            if (signal.type === 'peer-left' && signal.to === 'guest') {
                const error = new RemotePeerConnectError('host-closed', 'remotePairing.error.hostClosed')
                if (readySettled) {
                    emitRemoteClose(error)
                    return
                }
                finish(() => reject(error))
            }
        }

        function handleSignalMessageError(error: unknown): void {
            const connectionError =
                error instanceof Error ? error : createRemotePairingCodedError('remotePairing.error.socket')
            if (readySettled) {
                emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying'))
                return
            }
            finish(() => reject(connectionError))
        }

        peer.addEventListener('icecandidate', (event) => {
            if (!event.candidate) return
            sendSignal({ type: 'candidate', to: 'host', payload: { candidate: event.candidate.toJSON() } })
        })

        peer.addEventListener('datachannel', (event) => {
            const channel = event.channel
            dataChannel = channel
            channel.addEventListener('open', () => {
                openedChannel = true
                if (!dataChannelHealth.start()) {
                    finish(() => reject(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying')))
                    return
                }
                finish(resolve)
            })
            channel.addEventListener('close', () => {
                dataChannelHealth.stop()
                if (closedByClient) return
                if (peer.connectionState === 'closed' || peer.connectionState === 'failed') {
                    emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying'))
                    return
                }
                peerDisconnectGrace.schedule()
            })
            channel.addEventListener('message', (messageEvent) => {
                dataChannelHealth.noteInbound()
                livenessProbe.noteInbound()
                handleRemotePeerChannelMessage({
                    data: messageEvent.data,
                    pendingRequests,
                    syncListeners: listeners,
                    terminalListeners,
                })
            })
        })

        peer.addEventListener('connectionstatechange', () => {
            if (peer.connectionState === 'connected') {
                peerDisconnectGrace.clear()
                return
            }
            if (peer.connectionState === 'disconnected') {
                if (readySettled) {
                    peerDisconnectGrace.schedule()
                    // Restart ICE in parallel with `join`: whoever gathers
                    // fresh candidates first restores the pair to `connected`.
                    tryRestartIce(peer)
                    if (socket?.readyState === WebSocket.OPEN) {
                        sendJoin()
                    }
                }
                return
            }
            if (peer.connectionState === 'closed') {
                if (readySettled) {
                    emitRemoteClose(new RemotePeerConnectError('closed', 'remotePairing.error.closedRetrying'))
                }
                return
            }
            if (peer.connectionState === 'failed') {
                peerDisconnectGrace.clear()
                if (readySettled) {
                    emitRemoteClose(buildTimeoutError(receivedOffer, relayAvailable))
                    return
                }
                finish(() => reject(buildTimeoutError(receivedOffer, relayAvailable)))
            }
        })

        removeWakeListeners = subscribeForegroundPulse(handlePageWake)
        openSignalSocket()
    })

    try {
        await ready
    } catch (error) {
        removeWakeListeners()
        stopSignalTimers()
        dataChannelHealth.stop()
        peerDisconnectGrace.clear()
        livenessProbe.dispose()
        peer.close()
        const activeSocket = socket as WebSocket | null
        activeSocket?.close()
        throw error
    }

    return createRemotePeerTransportBridge({
        requestPeer,
        syncListeners: listeners,
        terminalListeners,
        closeListeners,
        getCloseError: () => closedError,
        close() {
            closedByClient = true
            removeWakeListeners()
            stopSignalTimers()
            dataChannelHealth.stop()
            peerDisconnectGrace.clear()
            livenessProbe.dispose()
            pendingRequests.rejectAll(createRemotePairingCodedError('remotePairing.error.closed'))
            closeListeners.clear()
            dataChannel?.close()
            peer.close()
            socket?.close()
        },
        getTransportStats: () => readRemotePeerTransportStats(peer),
        uploadFile,
    })
}
