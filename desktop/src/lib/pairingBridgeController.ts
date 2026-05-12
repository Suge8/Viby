import { PAIRING_SIGNAL_RECONNECT_DELAY_MS } from '@viby/protocol/pairing'
import type { DesktopPairingSession, HubRuntimeStatus, PairingBridgeState, PairingBridgeStats } from '@/types'
import { LocalHubPairingClient } from './localHubPairingClient'
import { createPairingBridgeChannelHealth } from './pairingBridgeChannelHealth'
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
import { createPairingBridgeStateController } from './pairingBridgeState'
import { createPairingBridgeStatsController } from './pairingBridgeStatsSupport'
import { describePairingConnectionState, toIceServers } from './pairingBridgeSupport'
import { createPairingTelemetryPublisher } from './pairingBridgeTelemetrySupport'
import { sendPairingOffer, startPairingEventStream } from './pairingBridgeTransportSupport'
import { createPairingPresenceReporter } from './pairingPresenceSync'

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
    const publishPairingTelemetry = createPairingTelemetryPublisher(pairing)
    const iceRestartGate = createPairingBridgeIceRestartGate()
    const remoteCandidateQueue = createPairingBridgeRemoteCandidateQueue()
    const presence = createPairingPresenceReporter({
        client,
        pairingId: pairing.pairing.id,
        onError: reportAsyncError,
    })
    const channelHealth = createPairingBridgeChannelHealth({
        onStale: () => {
            // Stale heartbeats mean the existing data channel is silent, but
            // the bridge will fall straight into recovery / reconnect. The
            // host is still the owner of this pairing, so do not yank hub
            // presence here — only `presence.dispose()` flips it inactive.
            channel?.close()
            scheduleTransportRecovery('设备长时间无响应，正在自动接回。')
        },
    })
    const bridgeState = createPairingBridgeStateController({
        initialPairing: pairing.pairing,
        isDisposed: () => disposed.value,
        isLiveTransport: () =>
            channelHealth.isHealthy() &&
            channel?.readyState === 'open' &&
            peer?.connectionState !== 'failed' &&
            peer?.connectionState !== 'closed',
        onStateChange: options.onStateChange,
    })
    const setBridgeState = bridgeState.setState
    const setBridgeStats = bridgeState.setStats
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
        channelHealth.stop()
        suppressTransportClose = true
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
        setBridgeState({ phase: 'connecting', message, stats: null })
        startReconnectTask('配对桥接重建失败：')
    }

    function scheduleReconnect(message: string): void {
        if (disposed.value) return

        closeTransport()
        clearRecoveryTimer()
        clearReconnectTimer()
        setBridgeState({ phase: 'connecting', message, stats: null })
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
            scheduleReconnect('设备仍未接回，正在重建安全链路。')
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

    function emitBridgePresence(alive: boolean): void {
        const live = bridgeState.getPairing() ?? pairing.pairing
        const platform = live.guest?.metadata?.platform
        presence.set(alive, {
            deviceName: live.guest?.label,
            platform: typeof platform === 'string' ? platform : undefined,
        })
    }

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
            channelHealth,
            reportPairingPresence: emitBridgePresence,
            schedulePeerRecovery: scheduleTransportRecovery,
            reportAsyncError,
        })
    }

    const signalController = createPairingBridgeSignalSocketController({
        pairing,
        isDisposed: () => disposed.value,
        isSuppressed: () => suppressTransportClose,
        getChannel: () => channel,
        isChannelHealthy: channelHealth.isHealthy,
        getPeer: () => peer,
        getPairingSnapshot: bridgeState.getPairing,
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
        setBridgeState({ phase: 'connecting', message: '正在建立点对点链路。', stats: null })

        // iceCandidatePoolSize lets the peer pre-gather candidates as soon as
        // it is created instead of waiting for `setLocalDescription`. By the
        // time SDP exchange completes, candidates are ready and ICE typically
        // converges in <1s on a healthy network.
        const nextPeer = new RTCPeerConnection({
            iceServers: toIceServers(pairing.iceServers),
            iceCandidatePoolSize: 4,
            bundlePolicy: 'max-bundle',
        })
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
                // ICE restart success: the data channel never closed but the
                // stale timer may have fired during the negotiation gap.
                // Re-arm channelHealth so we give the new ICE pair a fresh
                // heartbeat window before reporting "正在握手" again, and treat an
                // open channel as ready since `connected` is the canonical
                // ICE success signal.
                if (channel?.readyState === 'open') {
                    if (!channelHealth.isHealthy()) channelHealth.start()
                    setBridgeState({ phase: 'ready', message: describePairingConnectionState(connectionState) })
                    statsController.startStatsPolling(nextPeer)
                    return
                }
                setBridgeState({ phase: 'connecting', message: '正在建立点对点链路。' })
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
        // Final alive=false is owned by the presence reporter so ordering and
        // keepalive teardown happen in one place.
        presence.dispose()
    }
}
