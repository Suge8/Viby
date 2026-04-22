import { PairingSignalSchema } from '@viby/protocol/pairing'
import type { PairingBridgeState, PairingSessionSnapshot } from '@/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import { executePairingPeerRequest, parsePairingPeerRequest, serializePairingPeerMessage } from './pairingBridgeCore'
import { readSignalPairingSnapshot, runPairingBridgeTask } from './pairingBridgeRuntimeSupport'
import { describePairingSnapshotMessage } from './pairingBridgeSupport'

type BridgeStateSetter = (
    state: Omit<PairingBridgeState, 'pairing'> & { pairing?: PairingSessionSnapshot | null }
) => void

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
    scheduleReconnect: (message: string) => void
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
        scheduleReconnect,
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
        if (!isDisposed() && !getSuppressTransportClose()) {
            scheduleReconnect('手机链路已断开，正在重建。')
        }
    })

    nextChannel.addEventListener('message', (event) => {
        const rawData = typeof event.data === 'string' ? event.data : ''
        runPairingBridgeTask(
            async () => {
                try {
                    const request = parsePairingPeerRequest(rawData)
                    const response = await executePairingPeerRequest(client, request)
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
}): Promise<void> {
    const parsed = PairingSignalSchema.safeParse(JSON.parse(options.event.data))
    if (!parsed.success || parsed.data.pairingId !== options.pairingId) {
        return
    }

    switch (parsed.data.type) {
        case 'offer': {
            await options.activePeer.setRemoteDescription(parsed.data.payload as RTCSessionDescriptionInit)
            const answer = await options.activePeer.createAnswer()
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
            await options.activePeer.setRemoteDescription(parsed.data.payload as RTCSessionDescriptionInit)
            return
        case 'candidate': {
            const candidate = readSignalCandidate(parsed.data.payload)
            if (candidate) {
                await options.activePeer.addIceCandidate(candidate)
            }
            return
        }
        case 'peer-left': {
            const nextPairing = readSignalPairingSnapshot(parsed.data.payload)
            if (nextPairing) {
                options.setBridgeState({
                    phase: 'connecting',
                    message: '手机已离开，等待它重新接回。',
                    pairing: nextPairing,
                })
            }
            options.scheduleReconnect('手机已离开，等待它重新接回。')
            return
        }
        case 'expire':
            options.setBridgeState({
                phase: 'error',
                message: '当前配对已过期或被删除。',
                pairing: readSignalPairingSnapshot(parsed.data.payload) ?? options.pairingSnapshot,
            })
            options.closeTransport()
            return
        case 'state': {
            const nextPairing = readSignalPairingSnapshot(parsed.data.payload) ?? options.pairingSnapshot
            options.setBridgeState({
                phase: 'connecting',
                message: describePairingSnapshotMessage(nextPairing),
                pairing: nextPairing,
            })
            return
        }
        case 'ready': {
            const nextPairing = readSignalPairingSnapshot(parsed.data.payload)
            if (nextPairing) {
                options.setBridgeState({
                    phase: 'connecting',
                    message: describePairingSnapshotMessage(nextPairing),
                    pairing: nextPairing,
                })
            }
            await options.ensureOffer(options.activePeer)
            return
        }
        default:
            return
    }
}
