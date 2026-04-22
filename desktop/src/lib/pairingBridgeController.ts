import type {
    DesktopPairingSession,
    HubRuntimeStatus,
    PairingBridgeState,
    PairingBridgeStats,
    PairingSessionSnapshot,
} from '@/types'
import { LocalHubPairingClient } from './localHubPairingClient'
import { attachPairingDataChannel, handlePairingSignalMessage } from './pairingBridgeControllerSupport'
import {
    describePairingBridgeError,
    handleUnsupportedPairingBridgeEnvironment,
    runPairingBridgeTask,
} from './pairingBridgeRuntimeSupport'
import { createPairingBridgeStatsController } from './pairingBridgeStatsSupport'
import { describePairingConnectionState, toIceServers } from './pairingBridgeSupport'
import { createPairingTelemetryPublisher } from './pairingBridgeTelemetrySupport'
import { sendPairingOffer, startPairingEventStream } from './pairingBridgeTransportSupport'

const RECONNECT_DELAY_MS = 1_000

export function startPairingBridge(options: {
    pairing: DesktopPairingSession
    status: HubRuntimeStatus
    onStateChange: (state: PairingBridgeState) => void
}): () => void {
    const unsupportedEnvironmentCleanup = handleUnsupportedPairingBridgeEnvironment(options)
    if (unsupportedEnvironmentCleanup) {
        return unsupportedEnvironmentCleanup
    }

    const pairing = options.pairing
    const client = new LocalHubPairingClient({
        baseUrl: options.status.localHubUrl,
        cliApiToken: options.status.cliApiToken,
    })
    const disposed = { value: false }
    let pairingSnapshot = pairing.pairing
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let peer: RTCPeerConnection | null = null
    let channel: RTCDataChannel | null = null
    let signalSocket: WebSocket | null = null
    let eventStreamAbort: AbortController | null = null
    let startedOffer = false
    let suppressTransportClose = false
    let restartCount = 0
    let pairingStats: PairingBridgeStats | null = null
    const publishPairingTelemetry = createPairingTelemetryPublisher(pairing)
    function setBridgeState(
        state: Omit<PairingBridgeState, 'pairing'> & {
            pairing?: PairingSessionSnapshot | null
            stats?: PairingBridgeStats | null
        }
    ): void {
        if (typeof state.pairing !== 'undefined' && state.pairing) pairingSnapshot = state.pairing
        if (typeof state.stats !== 'undefined') pairingStats = state.stats
        if (!disposed.value) {
            options.onStateChange({
                phase: state.phase,
                message: state.message,
                pairing: pairingSnapshot,
                stats: pairingStats,
            })
        }
    }

    function reportAsyncError(message: string, error: unknown): void {
        setBridgeState({ phase: 'error', message: `${message}${describePairingBridgeError(error)}` })
    }

    function clearReconnectTimer(): void {
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = null
    }

    function stopEventStream(): void {
        if (eventStreamAbort) eventStreamAbort.abort()
        eventStreamAbort = null
    }

    function closeTransport(): void {
        stopEventStream()
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
    }

    function scheduleReconnect(message: string): void {
        if (disposed.value) {
            return
        }

        closeTransport()
        clearReconnectTimer()
        setBridgeState({ phase: 'connecting', message })
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            runPairingBridgeTask(startTransport, {
                isDisposed: () => disposed.value,
                onError: (error) => reportAsyncError('配对桥接重连失败：', error),
            })
        }, RECONNECT_DELAY_MS)
    }

    async function ensureOffer(activePeer: RTCPeerConnection): Promise<void> {
        if (startedOffer || disposed.value || !signalSocket || signalSocket.readyState !== WebSocket.OPEN) {
            return
        }
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
        resetOfferState: () => {
            startedOffer = false
        },
        setBridgeState,
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
            scheduleReconnect,
            reportAsyncError,
        })
    }

    async function startTransport(): Promise<void> {
        if (disposed.value) {
            return
        }

        closeTransport()
        suppressTransportClose = false
        setBridgeState({ phase: 'connecting', message: '正在建立点对点链路。' })

        const nextPeer = new RTCPeerConnection({
            iceServers: toIceServers(pairing.iceServers),
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
                setBridgeState({ phase: 'ready', message: describePairingConnectionState(connectionState) })
                statsController.startStatsPolling(nextPeer)
                return
            }

            if (connectionState === 'disconnected') {
                if (!statsController.tryIceRestart('链路波动，正在执行 ICE 重启。')) {
                    scheduleReconnect(describePairingConnectionState(connectionState))
                }
                return
            }

            if (connectionState === 'failed') {
                if (!statsController.tryIceRestart('点对点链路失败，正在执行 ICE 重启。')) {
                    scheduleReconnect(describePairingConnectionState(connectionState))
                }
                return
            }
        })

        attachDataChannel(
            nextPeer.createDataChannel('control', {
                ordered: true,
            })
        )

        const nextSocket = new WebSocket(pairing.wsUrl)
        signalSocket = nextSocket
        nextSocket.addEventListener('open', () => {
            nextSocket.send(
                JSON.stringify({
                    pairingId: pairing.pairing.id,
                    type: 'join',
                })
            )
        })

        nextSocket.addEventListener('message', (event) => {
            runPairingBridgeTask(
                async () => {
                    const activePeer = peer
                    if (!activePeer) {
                        return
                    }

                    await handlePairingSignalMessage({
                        event: event as MessageEvent<string>,
                        activePeer,
                        pairingId: pairing.pairing.id,
                        pairingSnapshot,
                        signalSocket,
                        setBridgeState,
                        scheduleReconnect,
                        closeTransport,
                        ensureOffer,
                    })
                },
                {
                    isDisposed: () => disposed.value,
                    onError: (error) => reportAsyncError('配对信令处理失败：', error),
                }
            )
        })

        nextSocket.addEventListener('close', () => {
            if (signalSocket === nextSocket && !disposed.value && !suppressTransportClose) {
                scheduleReconnect('配对信令断开，正在重连。')
            }
        })

        nextSocket.addEventListener('error', () => {
            if (!disposed.value) {
                setBridgeState({ phase: 'error', message: '配对信令出错。' })
            }
        })
    }

    options.onStateChange({
        phase: 'connecting',
        message: '正在建立点对点链路。',
        pairing: pairing.pairing,
        stats: null,
    })
    runPairingBridgeTask(startTransport, {
        isDisposed: () => disposed.value,
        onError: (error) => reportAsyncError('配对桥接启动失败：', error),
    })

    return () => {
        disposed.value = true
        clearReconnectTimer()
        closeTransport()
    }
}
