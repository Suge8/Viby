import { PROTOCOL_VERSION } from '@viby/protocol'
import {
    createPairingPeerTextSender,
    type PairingPeerHeartbeat,
    type PairingPeerTextAssembler,
    type PairingPeerTextPriority,
    type PairingPeerTextSender,
    type PairingPeerTextSendReceipt,
    type PairingPeerTextWritable,
    splitPairingPeerTextMessage,
} from '@viby/protocol/pairing'
import type { LocalHubPairingClient } from './localHubPairingClient'
import {
    executePairingPeerRequest,
    parsePairingHeartbeat,
    parsePairingPeerRequest,
    serializePairingPeerMessage,
    serializePairingTerminalEvent,
} from './pairingPeerRpcCore'

export type PairingPeerTextSink = PairingPeerTextWritable & {
    readonly sender?: PairingPeerTextSender
    readonly textChunkBytes?: number
}

export class HubPausedError extends Error {
    readonly code = 'hub_paused'
    constructor() {
        super('hub_paused')
        this.name = 'HubPausedError'
    }
}

const textEncoder = new TextEncoder()

export function isHubPausedError(error: unknown): boolean {
    return (
        error instanceof HubPausedError ||
        (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'hub_paused')
    )
}

export function canSendPairingPeerText(sink: PairingPeerTextSink): boolean {
    return sink.readyState === 'open' || sink.readyState === 1
}

export function sendPairingPeerText(
    sink: PairingPeerTextSink,
    data: string,
    priority: PairingPeerTextPriority = 'interactive'
): Promise<PairingPeerTextSendReceipt> {
    if (sink.sender) return sink.sender.send(data, { priority })
    const frames = sink.textChunkBytes ? splitPairingPeerTextMessage(data, sink.textChunkBytes) : [data]
    for (const frame of frames) sink.send(frame)
    return Promise.resolve({ bytes: textEncoder.encode(data).byteLength, chunks: frames.length })
}

export function createDataChannelTextSink(channel: RTCDataChannel): PairingPeerTextSink {
    const writable: PairingPeerTextWritable = {
        get readyState() {
            return channel.readyState
        },
        get bufferedAmount() {
            return channel.bufferedAmount
        },
        get bufferedAmountLowThreshold() {
            return channel.bufferedAmountLowThreshold
        },
        set bufferedAmountLowThreshold(value) {
            channel.bufferedAmountLowThreshold = value
        },
        addEventListener: (type, listener) => channel.addEventListener(type, listener),
        removeEventListener: (type, listener) => channel.removeEventListener(type, listener),
        send: (data) => channel.send(data),
    }
    return Object.assign(writable, { sender: createPairingPeerTextSender(writable) })
}

export async function handlePairingPeerPayload(options: {
    data: unknown
    textAssembler?: PairingPeerTextAssembler
    getClient: () => LocalHubPairingClient
    onActive: (sample?: { roundTripTimeMs?: number | null; sampledAt?: number | null }) => void
    onHeartbeat?: (
        heartbeat: PairingPeerHeartbeat
    ) => { roundTripTimeMs?: number | null; sampledAt?: number | null } | void
    onSendError?: (error: unknown) => void
    sink: PairingPeerTextSink
}): Promise<void> {
    const { data, getClient, onActive, onHeartbeat, sink } = options
    const rawData = typeof data === 'string' ? (options.textAssembler ? options.textAssembler.accept(data) : data) : ''
    if (rawData === null) return
    const heartbeat = rawData ? parsePairingHeartbeat(rawData) : null
    if (heartbeat) {
        const sample = onHeartbeat?.(heartbeat) ?? undefined
        onActive(sample)
        if (!heartbeat.ack && canSendPairingPeerText(sink)) {
            await sendPairingPeerText(
                sink,
                serializePairingPeerMessage({ ...heartbeat, ack: true, protocolVersion: PROTOCOL_VERSION }),
                'urgent'
            )
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
                if (canSendPairingPeerText(sink))
                    void sendPairingPeerText(sink, serializePairingTerminalEvent(terminalEvent), 'bulk').catch(
                        options.onSendError ?? (() => undefined)
                    )
            },
        })
        if (canSendPairingPeerText(sink))
            await sendPairingPeerText(sink, serializePairingPeerMessage(response), getResponsePriority(request.method))
    } catch (error) {
        if (!canSendPairingPeerText(sink)) return
        await sendPairingPeerText(
            sink,
            request && isHubPausedError(error) ? serializeHubPausedRequest(request.id) : serializeInvalidRequest(error),
            'urgent'
        )
    }
}

function getResponsePriority(method: string): PairingPeerTextPriority {
    return method === 'sessions.list' || method === 'session.messages' || method === 'session.load-after'
        ? 'bulk'
        : 'interactive'
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

async function acceptUploadChunk(getClient: () => LocalHubPairingClient, data: unknown): Promise<boolean> {
    try {
        return await getClient().acceptUploadChunk(data)
    } catch (error) {
        if (isHubPausedError(error)) return false
        throw error
    }
}
