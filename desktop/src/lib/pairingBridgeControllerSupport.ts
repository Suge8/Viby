import type { PairingBridgeState, PairingSessionSnapshot } from '@/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import {
    executePairingPeerRequest,
    isPairingHeartbeat,
    parsePairingPeerRequest,
    serializePairingPeerMessage,
    serializePairingTerminalEvent,
} from './pairingPeerRpcCore'

type BridgeStateSetter = (
    state: Omit<PairingBridgeState, 'pairing'> & { pairing?: PairingSessionSnapshot | null }
) => void

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

export function attachPairingDataChannel(options: {
    channel: RTCDataChannel
    getClient: () => LocalHubPairingClient
    isDisposed: () => boolean
    setBridgeState: BridgeStateSetter
    startEventStream: (channel: RTCDataChannel) => Promise<void>
    stopEventStream: () => void
    reportPairingPresence: (alive: boolean) => void
    reportAsyncError: (message: string, error: unknown) => void
}): void {
    const {
        channel,
        getClient,
        isDisposed,
        setBridgeState,
        startEventStream,
        stopEventStream,
        reportPairingPresence,
        reportAsyncError,
    } = options
    channel.addEventListener('open', () => {
        reportPairingPresence(true)
        void startEventStream(channel).catch((error) => reportAsyncError('配对事件流启动失败：', error))
    })
    channel.addEventListener('close', () => {
        stopEventStream()
        closeAllTerminals(getClient)
        reportPairingPresence(true)
        if (!isDisposed()) setBridgeState({ phase: 'connecting', message: '正在握手' })
    })
    channel.addEventListener('message', (event) => {
        const rawData = typeof event.data === 'string' ? event.data : ''
        if (rawData && isPairingHeartbeat(rawData)) {
            if (channel.readyState === 'open') channel.send(rawData)
            setBridgeState({ phase: 'ready', message: '已连接' })
            return
        }
        void handleMessage(event.data).catch((error) => reportAsyncError('配对请求处理失败：', error))
    })

    async function handleMessage(data: unknown): Promise<void> {
        if (typeof data !== 'string' && (await acceptUploadChunk(getClient, data))) return
        let request: ReturnType<typeof parsePairingPeerRequest> | null = null
        try {
            request = parsePairingPeerRequest(typeof data === 'string' ? data : '')
            const response = await executePairingPeerRequest(getClient(), request, {
                emitTerminalEvent: (terminalEvent) => {
                    if (channel.readyState === 'open') channel.send(serializePairingTerminalEvent(terminalEvent))
                },
            })
            if (channel.readyState === 'open') channel.send(serializePairingPeerMessage(response))
        } catch (error) {
            if (channel.readyState !== 'open') return
            channel.send(
                request && isHubPausedError(error)
                    ? serializeHubPausedRequest(request.id)
                    : serializeInvalidRequest(error)
            )
        }
    }
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
