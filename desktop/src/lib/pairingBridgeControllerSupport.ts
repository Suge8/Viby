import { PairingSignalSchema, readPairingSignalTransportId } from '@viby/protocol/pairing'
import type { PairingBridgeState, PairingSessionSnapshot } from '@/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import {
    executePairingPeerRequest,
    parsePairingPeerRequest,
    serializePairingPeerMessage,
    serializePairingTerminalEvent,
} from './pairingBridgeCore'
import { PAIRING_PHONE_PAUSED_MESSAGE, PAIRING_STALE_MESSAGE } from './pairingBridgeRecovery'
import { readSignalPairingSnapshot, runPairingBridgeTask } from './pairingBridgeRuntimeSupport'
import { describePairingConnectionState, describePairingSnapshotMessage } from './pairingBridgeSupport'

type BridgeStateSetter = (
    state: Omit<PairingBridgeState, 'pairing'> & { pairing?: PairingSessionSnapshot | null }
) => void

type GuestReadyTransport = { fromGuest: boolean; transportId: string | null; knownTransportId: string | null }

function resolveSignalPhase(
    activePeer: RTCPeerConnection,
    channel?: RTCDataChannel | null
): PairingBridgeState['phase'] {
    if (channel && channel.readyState !== 'open') return 'connecting'
    return activePeer.connectionState === 'connected' ? 'ready' : 'connecting'
}

function readSignalingState(activePeer: RTCPeerConnection): RTCSignalingState {
    return activePeer.signalingState
}

function isClosedChannel(channel: RTCDataChannel | null | undefined): boolean {
    return channel?.readyState === 'closed'
}

function isHealthyGuestTransport(options: {
    signal: { from?: string }
    activePeer: RTCPeerConnection
    channel: RTCDataChannel | null | undefined
}): boolean {
    return (
        options.signal.from === 'guest' &&
        options.activePeer.connectionState === 'connected' &&
        options.channel?.readyState === 'open'
    )
}

function shouldRebuildForGuestReady(options: GuestReadyTransport): boolean {
    return (
        options.fromGuest &&
        options.knownTransportId !== null &&
        Boolean(options.transportId) &&
        options.transportId !== options.knownTransportId
    )
}

function resolveSignalMessage(
    activePeer: RTCPeerConnection,
    pairing: PairingSessionSnapshot,
    channel?: RTCDataChannel | null
): string {
    if (channel && channel.readyState !== 'open') return '正在建立点对点链路。'
    return activePeer.connectionState === 'connected'
        ? describePairingConnectionState(activePeer.connectionState)
        : describePairingSnapshotMessage(pairing)
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

function readSignalCandidate(payload: unknown): RTCIceCandidateInit | null {
    if (!payload || typeof payload !== 'object') {
        return payload as RTCIceCandidateInit | null
    }

    if ('candidate' in payload && payload.candidate && typeof payload.candidate === 'object') {
        return payload.candidate as RTCIceCandidateInit
    }

    return payload as RTCIceCandidateInit
}

export function attachPairingDataChannel(options: {
    nextChannel: RTCDataChannel
    client: LocalHubPairingClient
    isDisposed: () => boolean
    getSuppressTransportClose: () => boolean
    setBridgeState: BridgeStateSetter
    stopEventStream: () => void
    startEventStream: (activeChannel: RTCDataChannel) => Promise<void>
    schedulePeerRecovery: () => void
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
        schedulePeerRecovery,
        reportAsyncError,
    } = options

    nextChannel.addEventListener('open', () => {
        setBridgeState({ phase: 'ready', message: '手机链路已接通。' })
        runPairingBridgeTask(() => startEventStream(nextChannel), {
            isDisposed,
            onError: (error) => reportAsyncError('配对事件流启动失败：', error),
        })
    })

    nextChannel.addEventListener('close', () => {
        stopEventStream()
        client.closeAllTerminals()
        if (!isDisposed() && !getSuppressTransportClose()) {
            schedulePeerRecovery()
        }
    })

    nextChannel.addEventListener('message', (event) => {
        const rawData = typeof event.data === 'string' ? event.data : ''
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
            options.setBridgeState({
                phase: resolveSignalPhase(options.activePeer, channel),
                message: resolveSignalMessage(options.activePeer, nextPairing, channel),
                pairing: nextPairing,
            })
            return
        }
        case 'ready': {
            const channel = options.getChannel?.()
            const nextPairing = readSignalPairingSnapshot(parsed.data.payload)
            const knownTransportId = options.getGuestTransportId?.() ?? null
            const transportId = readPairingSignalTransportId(parsed.data.payload)
            const healthyGuestTransport = isHealthyGuestTransport({
                signal: parsed.data,
                activePeer: options.activePeer,
                channel,
            })
            const keepHealthyTransport = Boolean(
                transportId && transportId === knownTransportId && healthyGuestTransport
            )
            if (transportId) options.setGuestTransportId?.(transportId)
            if (
                isClosedChannel(channel) ||
                shouldRebuildForGuestReady({
                    fromGuest: parsed.data.from === 'guest',
                    transportId,
                    knownTransportId,
                })
            ) {
                options.resetOfferState?.()
                const message = '手机已回来，正在重建安全链路。'
                if (options.rebuildTransport) {
                    options.rebuildTransport(message)
                    return
                }
                options.scheduleReconnect(message)
                return
            }
            if (nextPairing) {
                options.setBridgeState({
                    phase: resolveSignalPhase(options.activePeer, channel),
                    message: resolveSignalMessage(options.activePeer, nextPairing, channel),
                    pairing: nextPairing,
                })
            }
            if (keepHealthyTransport) {
                return
            }
            if (options.activePeer.connectionState !== 'connected') {
                if (options.tryIceRestart?.('手机已回来，正在刷新点对点链路。')) {
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
