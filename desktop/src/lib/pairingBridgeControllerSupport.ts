import { PairingSignalSchema, readPairingSignalTransportId } from '@viby/protocol/pairing'
import type { PairingBridgeState, PairingSessionSnapshot } from '@/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import type { PairingBridgeChannelHealth } from './pairingBridgeChannelHealth'
import {
    executePairingPeerRequest,
    isPairingHeartbeat,
    parsePairingPeerRequest,
    serializePairingPeerMessage,
    serializePairingTerminalEvent,
} from './pairingBridgeCore'
import { PAIRING_PHONE_PAUSED_MESSAGE, PAIRING_STALE_MESSAGE } from './pairingBridgeRecovery'
import { readSignalPairingSnapshot, runPairingBridgeTask } from './pairingBridgeRuntimeSupport'
import {
    isClosedChannel,
    isHealthyGuestTransport,
    readSignalCandidate,
    resolveSignalMessage,
    resolveSignalPhase,
    shouldRebuildForGuestReady,
} from './pairingBridgeSignalSupport'
import { describePairingConnectionState } from './pairingBridgeSupport'

type BridgeStateSetter = (
    state: Omit<PairingBridgeState, 'pairing'> & { pairing?: PairingSessionSnapshot | null }
) => void

function readSignalingState(activePeer: RTCPeerConnection): RTCSignalingState {
    return activePeer.signalingState
}

function serializeInvalidRequest(error: unknown): string {
    return serializePairingPeerMessage({
        kind: 'response',
        id: 'invalid-request',
        ok: false,
        error: {
            code: 'pairing_peer_invalid_request',
            message: error instanceof Error ? error.message : String(error),
        },
    })
}

export function attachPairingDataChannel(options: {
    nextChannel: RTCDataChannel
    client: LocalHubPairingClient
    isDisposed: () => boolean
    getSuppressTransportClose: () => boolean
    setBridgeState: BridgeStateSetter
    stopEventStream: () => void
    startEventStream: (activeChannel: RTCDataChannel) => Promise<void>
    reportPairingPresence: (alive: boolean) => void
    schedulePeerRecovery: () => void
    channelHealth: PairingBridgeChannelHealth
    reportAsyncError: (message: string, error: unknown) => void
}): void {
    const {
        nextChannel,
        client,
        isDisposed,
        getSuppressTransportClose,
        setBridgeState,
        stopEventStream,
        startEventStream,
        reportPairingPresence,
        schedulePeerRecovery,
        channelHealth,
        reportAsyncError,
    } = options

    nextChannel.addEventListener('open', () => {
        if (getSuppressTransportClose()) return
        channelHealth.start()
        setBridgeState({ phase: 'connecting', message: '正在建立点对点链路。' })
        // Presence reporter owns ordering, retry and keepalive. The bridge only
        // declares the desired state on each data-channel event boundary.
        reportPairingPresence(true)
        runPairingBridgeTask(() => startEventStream(nextChannel), {
            isDisposed,
            onError: (error) => reportAsyncError('配对事件流启动失败：', error),
        })
    })

    nextChannel.addEventListener('close', () => {
        if (getSuppressTransportClose()) return
        channelHealth.stop()
        // Do NOT flip presence to inactive on a transport-level close: the
        // bridge is about to schedule peer recovery (paused state), the host
        // is still serving this pairing, and broker mobile disconnect grace is
        // up to 10 minutes. Hub presence only flips inactive on dispose so
        // the desktop popover keeps showing the device in a “等待回连” state
        // instead of dropping the count to 0 while the phone is roaming.
        stopEventStream()
        client.closeAllTerminals()
        if (!isDisposed()) {
            schedulePeerRecovery()
        }
    })

    nextChannel.addEventListener('message', (event) => {
        if (getSuppressTransportClose()) return
        if (channelHealth.noteInbound()) {
            setBridgeState({ phase: 'ready', message: describePairingConnectionState('connected') })
        }
        const rawData = typeof event.data === 'string' ? event.data : ''
        if (rawData && isPairingHeartbeat(rawData)) {
            if (nextChannel.readyState === 'open') {
                try {
                    nextChannel.send(rawData)
                } catch (error) {
                    nextChannel.close()
                    reportAsyncError('配对心跳响应失败：', error)
                }
            }
            return
        }
        runPairingBridgeTask(
            async () => {
                if (typeof event.data !== 'string' && (await client.acceptUploadChunk(event.data))) {
                    return
                }
                try {
                    const request = parsePairingPeerRequest(rawData)
                    const response = await executePairingPeerRequest(client, request, {
                        emitTerminalEvent: (terminalEvent) => {
                            if (nextChannel.readyState === 'open') {
                                nextChannel.send(serializePairingTerminalEvent(terminalEvent))
                            }
                        },
                    })
                    if (nextChannel.readyState === 'open') {
                        nextChannel.send(serializePairingPeerMessage(response))
                    }
                } catch (error) {
                    if (nextChannel.readyState === 'open') {
                        nextChannel.send(serializeInvalidRequest(error))
                    }
                }
            },
            {
                isDisposed,
                onError: (error) => reportAsyncError('配对请求处理失败：', error),
            }
        )
    })
}

export async function handlePairingSignalMessage(options: {
    event: MessageEvent<string>
    activePeer: RTCPeerConnection
    pairingId: string
    pairingSnapshot: PairingSessionSnapshot
    signalSocket: WebSocket | null
    setBridgeState: BridgeStateSetter
    scheduleReconnect: (message: string) => void
    closeTransport: () => void
    ensureOffer: (activePeer: RTCPeerConnection) => Promise<void>
    rebuildTransport?: (message: string) => void
    tryIceRestart?: (message: string) => boolean
    getGuestTransportId?: () => string | null
    setGuestTransportId?: (transportId: string) => void
    resetOfferState?: () => void
    schedulePeerRecovery?: () => void
    getChannel?: () => RTCDataChannel | null
    isChannelHealthy?: () => boolean
    addRemoteCandidate?: (peer: RTCPeerConnection, candidate: RTCIceCandidateInit) => Promise<void>
    flushRemoteCandidates?: (peer: RTCPeerConnection) => Promise<void>
}): Promise<void> {
    const parsed = PairingSignalSchema.safeParse(JSON.parse(options.event.data))
    if (!parsed.success || parsed.data.pairingId !== options.pairingId) {
        return
    }

    switch (parsed.data.type) {
        case 'offer': {
            if (readSignalingState(options.activePeer) !== 'stable') {
                return
            }
            await options.activePeer.setRemoteDescription(parsed.data.payload as RTCSessionDescriptionInit)
            await options.flushRemoteCandidates?.(options.activePeer)
            const answer = await options.activePeer.createAnswer()
            if (readSignalingState(options.activePeer) !== 'have-remote-offer') {
                return
            }
            await options.activePeer.setLocalDescription(answer)
            options.signalSocket?.send(
                JSON.stringify({
                    pairingId: options.pairingId,
                    type: 'answer',
                    to: 'guest',
                    payload: answer,
                })
            )
            return
        }
        case 'answer':
            if (options.activePeer.signalingState !== 'have-local-offer') {
                return
            }
            await options.activePeer.setRemoteDescription(parsed.data.payload as RTCSessionDescriptionInit)
            await options.flushRemoteCandidates?.(options.activePeer)
            return
        case 'candidate': {
            const candidate = readSignalCandidate(parsed.data.payload)
            if (candidate) {
                await (options.addRemoteCandidate ?? ((peer, value) => peer.addIceCandidate(value)))(
                    options.activePeer,
                    candidate
                )
            }
            return
        }
        case 'peer-left': {
            options.resetOfferState?.()
            options.setBridgeState({
                phase: 'paused',
                message: PAIRING_PHONE_PAUSED_MESSAGE,
                pairing: readSignalPairingSnapshot(parsed.data.payload) ?? options.pairingSnapshot,
            })
            options.schedulePeerRecovery?.()
            return
        }
        case 'expire':
            options.setBridgeState({
                phase: 'error',
                message: PAIRING_STALE_MESSAGE,
                pairing: readSignalPairingSnapshot(parsed.data.payload) ?? options.pairingSnapshot,
            })
            options.closeTransport()
            return
        case 'state': {
            const nextPairing = readSignalPairingSnapshot(parsed.data.payload) ?? options.pairingSnapshot
            const channel = options.getChannel?.()
            const channelHealthy = options.isChannelHealthy?.() ?? false
            options.setBridgeState({
                phase: resolveSignalPhase(options.activePeer, channel, channelHealthy),
                message: resolveSignalMessage(options.activePeer, nextPairing, channel, channelHealthy),
                pairing: nextPairing,
            })
            return
        }
        case 'ready': {
            const channel = options.getChannel?.()
            const nextPairing = readSignalPairingSnapshot(parsed.data.payload)
            const knownTransportId = options.getGuestTransportId?.() ?? null
            const transportId = readPairingSignalTransportId(parsed.data.payload)
            const channelHealthy = options.isChannelHealthy?.() ?? false
            const healthyGuestTransport = isHealthyGuestTransport({
                signal: parsed.data,
                activePeer: options.activePeer,
                channel,
                channelHealthy,
            })
            const shouldReplaceGuestTransport = shouldRebuildForGuestReady({
                fromGuest: parsed.data.from === 'guest',
                transportId,
                knownTransportId,
            })
            if (transportId && transportId !== knownTransportId) options.setGuestTransportId?.(transportId)
            if (isClosedChannel(channel) || shouldReplaceGuestTransport) {
                options.resetOfferState?.()
                const message = '设备已回来，正在重建安全链路。'
                if (options.rebuildTransport) {
                    options.rebuildTransport(message)
                    return
                }
                options.scheduleReconnect(message)
                return
            }
            if (healthyGuestTransport) {
                if (nextPairing) {
                    options.setBridgeState({
                        phase: 'ready',
                        message: describePairingConnectionState('connected'),
                        pairing: nextPairing,
                    })
                }
                return
            }
            if (nextPairing) {
                options.setBridgeState({
                    phase: resolveSignalPhase(options.activePeer, channel, channelHealthy),
                    message: resolveSignalMessage(options.activePeer, nextPairing, channel, channelHealthy),
                    pairing: nextPairing,
                })
            }
            if (options.activePeer.connectionState !== 'connected') {
                if (options.tryIceRestart?.('设备已回来，正在刷新点对点链路。')) {
                    return
                }
                options.resetOfferState?.()
            }
            await options.ensureOffer(options.activePeer)
            return
        }
        default:
            return
    }
}
