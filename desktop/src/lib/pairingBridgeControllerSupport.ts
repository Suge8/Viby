import type { PairingPeerHeartbeat } from '@viby/protocol/pairing'
import type { LocalHubPairingClient } from './localHubPairingClient'
import {
    executePairingPeerRequest,
    parsePairingHeartbeat,
    parsePairingPeerRequest,
    serializePairingPeerMessage,
    serializePairingTerminalEvent,
} from './pairingPeerRpcCore'

export type PairingPeerTextSink = {
    readonly readyState: RTCDataChannelState | number
    send(data: string): void
}

export class HubPausedError extends Error {
    readonly code = 'hub_paused'
    constructor() {
        super('hub_paused')
        this.name = 'HubPausedError'
    }
}

export function isHubPausedError(error: unknown): boolean {
    return (
        error instanceof HubPausedError ||
        (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'hub_paused')
    )
}

function serializeHubPausedRequest(id: string): string {
    return serializePairingPeerMessage({
        kind: 'response',
        id,
        ok: false,
        error: { code: 'hub_paused', message: 'Hub is paused' },
    })
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

export function canSendPairingPeerText(sink: PairingPeerTextSink): boolean {
    return sink.readyState === 'open' || sink.readyState === 1
}

export async function handlePairingPeerPayload(options: {
    data: unknown
    getClient: () => LocalHubPairingClient
    onActive: (sample?: { roundTripTimeMs?: number | null; sampledAt?: number | null }) => void
    onHeartbeat?: (
        heartbeat: PairingPeerHeartbeat
    ) => { roundTripTimeMs?: number | null; sampledAt?: number | null } | void
    sink: PairingPeerTextSink
}): Promise<void> {
    const { data, getClient, onActive, onHeartbeat, sink } = options
    const rawData = typeof data === 'string' ? data : ''
    const heartbeat = rawData ? parsePairingHeartbeat(rawData) : null
    if (heartbeat) {
        const sample = onHeartbeat?.(heartbeat) ?? undefined
        onActive(sample)
        if (!heartbeat.ack && canSendPairingPeerText(sink)) {
            sink.send(serializePairingPeerMessage({ ...heartbeat, ack: true }))
        }
        return
    }
    if (typeof data !== 'string' && (await acceptUploadChunk(getClient, data))) {
        onActive()
        return
    }

    let request: ReturnType<typeof parsePairingPeerRequest> | null = null
    try {
        request = parsePairingPeerRequest(rawData)
        onActive()
        const response = await executePairingPeerRequest(getClient(), request, {
            emitTerminalEvent: (terminalEvent) => {
                if (canSendPairingPeerText(sink)) sink.send(serializePairingTerminalEvent(terminalEvent))
            },
        })
        if (canSendPairingPeerText(sink)) sink.send(serializePairingPeerMessage(response))
    } catch (error) {
        if (!canSendPairingPeerText(sink)) return
        sink.send(
            request && isHubPausedError(error) ? serializeHubPausedRequest(request.id) : serializeInvalidRequest(error)
        )
    }
}

export function attachPairingDataChannel(options: {
    channel: RTCDataChannel
    getClient: () => LocalHubPairingClient
    isDisposed: () => boolean
    onChannelOpen: () => void
    onChannelActive: () => void
    onChannelClosed: () => void
    startEventStream: (channel: RTCDataChannel) => Promise<void>
    stopEventStream: () => void
    reportAsyncError: (message: string, error: unknown) => void
}): void {
    const {
        channel,
        getClient,
        isDisposed,
        onChannelOpen,
        onChannelActive,
        onChannelClosed,
        startEventStream,
        stopEventStream,
        reportAsyncError,
    } = options
    channel.addEventListener('open', () => {
        onChannelOpen()
        void startEventStream(channel).catch((error) => reportAsyncError('配对事件流启动失败：', error))
    })
    channel.addEventListener('close', () => {
        stopEventStream()
        closeAllTerminals(getClient)
        if (!isDisposed()) onChannelClosed()
    })
    channel.addEventListener('message', (event) => {
        void handlePairingPeerPayload({
            data: event.data,
            getClient,
            onActive: onChannelActive,
            sink: channel,
        }).catch((error) => reportAsyncError('配对请求处理失败：', error))
    })
}

async function acceptUploadChunk(getClient: () => LocalHubPairingClient, data: unknown): Promise<boolean> {
    try {
        return await getClient().acceptUploadChunk(data)
    } catch (error) {
        if (isHubPausedError(error)) return false
        throw error
    }
}

function closeAllTerminals(getClient: () => LocalHubPairingClient): void {
    try {
        getClient().closeAllTerminals()
    } catch (error) {
        if (!isHubPausedError(error)) throw error
    }
}
