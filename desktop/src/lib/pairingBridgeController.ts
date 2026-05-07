import { PAIRING_SIGNAL_RECONNECT_DELAY_MS } from '@viby/protocol/pairing'
import type {
    DesktopPairingSession,
    HubRuntimeStatus,
    PairingBridgeState,
    PairingBridgeStats,
    PairingSessionSnapshot,
} from '@/types'
import { LocalHubPairingClient } from './localHubPairingClient'
import { attachPairingDataChannel } from './pairingBridgeControllerSupport'
import { createPairingBridgeRemoteCandidateQueue } from './pairingBridgeIceCandidates'
import { createPairingBridgeIceRestartGate } from './pairingBridgeIceRecovery'
import { PAIRING_PHONE_PAUSED_MESSAGE, PAIRING_TRANSPORT_RECOVERY_GRACE_MS } from './pairingBridgeRecovery'
import {
    describePairingBridgeError,
    handleUnsupportedPairingBridgeEnvironment,
    runPairingBridgeTask,
} from './pairingBridgeRuntimeSupport'
import { createPairingBridgeSignalSocketController } from './pairingBridgeSignalSocket'
import { createPairingBridgeStatsController } from './pairingBridgeStatsSupport'
import { describePairingConnectionState, toIceServers } from './pairingBridgeSupport'
import { createPairingTelemetryPublisher } from './pairingBridgeTelemetrySupport'
import { sendPairingOffer, startPairingEventStream } from './pairingBridgeTransportSupport'

const RECONNECT_DELAY_MS = PAIRING_SIGNAL_RECONNECT_DELAY_MS
export function startPairingBridge(options: {
    pairing: DesktopPairingSession
    status: HubRuntimeStatus
    onStateChange: (state: PairingBridgeState) => void
}): () => void {
    const unsupportedEnvironmentCleanup = handleUnsupportedPairingBridgeEnvironment(options)
    if (unsupportedEnvironmentCleanup) return unsupportedEnvironmentCleanup
    const pairing = options.pairing
    const client = new LocalHubPairingClient({
        baseUrl: options.status.localHubUrl,
        cliApiToken: options.status.cliApiToken,
    })
    const disposed = { value: false }
    let pairingSnapshot = pairing.pairing
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null
    let peer: RTCPeerConnection | null = null
    let channel: RTCDataChannel | null = null
    let signalSocket: WebSocket | null = null
    let eventStreamAbort: AbortController | null = null
    let startedOffer = false
    let suppressTransportClose = false
    let restartCount = 0
    let guestTransportId: string | null = null
    let pairingStats: PairingBridgeStats | null = null
    let bridgePhase: PairingBridgeState['phase'] = 'connecting'
    let bridgeMessage: string | null = '正在建立点对点链路。'
    const publishPairingTelemetry = createPairingTelemetryPublisher(pairing)
    const iceRestartGate = createPairingBridgeIceRestartGate()
    const remoteCandidateQueue = createPairingBridgeRemoteCandidateQueue()
    function setBridgeState(
        state: Omit<PairingBridgeState, 'pairing'> & {
            pairing?: PairingSessionSnapshot | null
            stats?: PairingBridgeStats | null
        }
    ): void {
        bridgePhase = state.phase
        bridgeMessage = state.message
        if (typeof state.pairing !== 'undefined' && state.pairing) pairingSnapshot = state.pairing
        if (typeof state.stats !== 'undefined') pairingStats = state.stats
        if (!disposed.value) {
            options.onStateChange({
                phase: bridgePhase,
                message: bridgeMessage,
                pairing: pairingSnapshot,
                stats: pairingStats,
            })
        }
    }
    function setBridgeStats(stats: PairingBridgeStats): void {
        pairingStats = stats
        if (!disposed.value) {
            options.onStateChange({ phase: bridgePhase, message: bridgeMessage, pairing: pairingSnapshot, stats })
        }
    }
    function reportAsyncError(message: string, error: unknown): void {
        setBridgeState({ phase: 'error', message: `${message}${describePairingBridgeError(error)}` })
    }
    function clearReconnectTimer(): void {
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = null
    }

    function clearRecoveryTimer(): void {
        if (recoveryTimer) clearTimeout(recoveryTimer)
        recoveryTimer = null
    }
    function stopEventStream(): void {
        if (eventStreamAbort) eventStreamAbort.abort()
        eventStreamAbort = null
    }

    function closeTransport(): void {
        stopEventStream()
        clearRecoveryTimer()
        signalController.clearReconnectTimer()
        statsController.stopStatsPolling()
        suppressTransportClose = true
        pairingStats = null
        channel?.close()
        channel = null
        peer?.close()
        peer = null
        signalSocket?.close()
        signalSocket = null
        startedOffer = false
        remoteCandidateQueue.clear()
    }
    function startReconnectTask(errorPrefix: string): void {
        runPairingBridgeTask(startTransport, {
            isDisposed: () => disposed.value,
            onError: (error) => reportAsyncError(errorPrefix, error),
        })
    }

    function rebuildTransport(message: string): void {
        if (disposed.value) return
        closeTransport()
        clearRecoveryTimer()
        clearReconnectTimer()
        setBridgeState({ phase: 'connecting', message })
        startReconnectTask('配对桥接重建失败：')
    }

    function scheduleReconnect(message: string): void {
        if (disposed.value) return

        closeTransport()
        clearRecoveryTimer()
        clearReconnectTimer()
        setBridgeState({ phase: 'connecting', message })
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            startReconnectTask('配对桥接重连失败：')
        }, RECONNECT_DELAY_MS)
    }

    function scheduleTransportRecovery(message = PAIRING_PHONE_PAUSED_MESSAGE): void {
        if (disposed.value || recoveryTimer) return
        setBridgeState({ phase: 'paused', message })
        recoveryTimer = setTimeout(() => {
            recoveryTimer = null
            scheduleReconnect('手机仍未接回，正在重建安全链路。')
        }, PAIRING_TRANSPORT_RECOVERY_GRACE_MS)
    }

    async function ensureOffer(activePeer: RTCPeerConnection): Promise<void> {
        if (startedOffer || disposed.value || !signalSocket || signalSocket.readyState !== WebSocket.OPEN) {
            return
        }
        remoteCandidateQueue.clear()
        startedOffer = true
        await sendPairingOffer(activePeer, pairing.pairing.id, signalSocket)
    }

    async function startEventStream(activeChannel: RTCDataChannel): Promise<void> {
        stopEventStream()
        const abortController = new AbortController()
        eventStreamAbort = abortController

        try {
            await startPairingEventStream(client, activeChannel, abortController)
        } catch (error) {
            if (!abortController.signal.aborted && !disposed.value) {
                setBridgeState({
                    phase: 'error',
                    message: error instanceof Error ? error.message : String(error),
                })
            }
        }
    }

    const statsController = createPairingBridgeStatsController({
        isDisposed: () => disposed.value,
        getChannel: () => channel,
        getPeer: () => peer,
        getSignalSocket: () => signalSocket,
        getRestartCount: () => restartCount,
        incrementRestartCount: () => {
            restartCount += 1
            return restartCount
        },
        canRestartIce: iceRestartGate.canRestart,
        resetOfferState: () => {
            startedOffer = false
        },
        setBridgeState,
        setBridgeStats,
        ensureOffer,
        publishPairingTelemetry,
        scheduleReconnect,
        reportAsyncError,
    })

    function attachDataChannel(nextChannel: RTCDataChannel): void {
        channel = nextChannel
        attachPairingDataChannel({
            nextChannel,
            client,
            isDisposed: () => disposed.value,
            getSuppressTransportClose: () => suppressTransportClose || channel !== nextChannel,
            setBridgeState,
            stopEventStream,
            startEventStream,
            schedulePeerRecovery: scheduleTransportRecovery,
            reportAsyncError,
        })
    }

    const signalController = createPairingBridgeSignalSocketController({
        pairing,
        isDisposed: () => disposed.value,
        isSuppressed: () => suppressTransportClose,
        getChannel: () => channel,
        getPeer: () => peer,
        getPairingSnapshot: () => pairingSnapshot,
        setSocket: (socket) => {
            signalSocket = socket
        },
        getSocket: () => signalSocket,
        setBridgeState,
        scheduleReconnect,
        closeTransport,
        ensureOffer,
        rebuildTransport,
        tryIceRestart: statsController.tryIceRestart,
        getGuestTransportId: () => guestTransportId,
        setGuestTransportId: (transportId) => {
            guestTransportId = transportId
        },
        resetOfferState: () => {
            startedOffer = false
        },
        schedulePeerRecovery: scheduleTransportRecovery,
        reportAsyncError,
        addRemoteCandidate: remoteCandidateQueue.add,
        flushRemoteCandidates: remoteCandidateQueue.flush,
    })

    async function startTransport(): Promise<void> {
        if (disposed.value) return

        closeTransport()
        suppressTransportClose = false
        setBridgeState({ phase: 'connecting', message: '正在建立点对点链路。' })

        const nextPeer = new RTCPeerConnection({ iceServers: toIceServers(pairing.iceServers) })
        peer = nextPeer

        nextPeer.addEventListener('icecandidate', (event) => {
            if (event.candidate && signalSocket?.readyState === WebSocket.OPEN) {
                signalSocket.send(
                    JSON.stringify({
                        pairingId: pairing.pairing.id,
                        type: 'candidate',
                        to: 'guest',
                        payload: { candidate: event.candidate.toJSON() },
                    })
                )
            }
        })

        nextPeer.addEventListener('connectionstatechange', () => {
            if (peer !== nextPeer) {
                return
            }

            const connectionState = nextPeer.connectionState
            if (connectionState === 'connected') {
                clearRecoveryTimer()
                setBridgeState({ phase: 'ready', message: describePairingConnectionState(connectionState) })
                statsController.startStatsPolling(nextPeer)
                return
            }

            if (connectionState === 'disconnected') {
                scheduleTransportRecovery()
                statsController.tryIceRestart('链路波动，正在执行 ICE 重启。')
                return
            }

            if (connectionState === 'failed') {
                if (statsController.tryIceRestart('点对点链路失败，正在执行 ICE 重启。')) {
                    return
                }
                scheduleReconnect(describePairingConnectionState(connectionState))
                return
            }
        })

        attachDataChannel(nextPeer.createDataChannel('control', { ordered: true }))

        signalController.open()
    }

    setBridgeState({ phase: 'connecting', message: '正在建立点对点链路。', pairing: pairing.pairing, stats: null })
    runPairingBridgeTask(startTransport, {
        isDisposed: () => disposed.value,
        onError: (error) => reportAsyncError('配对桥接启动失败：', error),
    })

    return () => {
        disposed.value = true
        clearReconnectTimer()
        clearRecoveryTimer()
        closeTransport()
    }
}
