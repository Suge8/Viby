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

function serializeInvalidRequest(error: unknown): string {
    return serializePairingPeerMessage({
        kind: 'response',
        id: 'invalid-request',
        ok: false,
        error: { code: 'pairing_peer_invalid_request', message: error instanceof Error ? error.message : String(error) },
    })
}

export function attachPairingDataChannel(options: {
    channel: RTCDataChannel
    client: LocalHubPairingClient
    isDisposed: () => boolean
    setBridgeState: BridgeStateSetter
    startEventStream: (channel: RTCDataChannel) => Promise<void>
    stopEventStream: () => void
    reportPairingPresence: (alive: boolean) => void
    reportAsyncError: (message: string, error: unknown) => void
}): void {
    const { channel, client, isDisposed, setBridgeState, startEventStream, stopEventStream, reportPairingPresence, reportAsyncError } = options
    channel.addEventListener('open', () => {
        reportPairingPresence(true)
        void startEventStream(channel).catch((error) => reportAsyncError('配对事件流启动失败：', error))
    })
    channel.addEventListener('close', () => {
        stopEventStream()
        client.closeAllTerminals()
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
        if (typeof data !== 'string' && (await client.acceptUploadChunk(data))) return
        try {
            const request = parsePairingPeerRequest(typeof data === 'string' ? data : '')
            const response = await executePairingPeerRequest(client, request, {
                emitTerminalEvent: (terminalEvent) => {
                    if (channel.readyState === 'open') channel.send(serializePairingTerminalEvent(terminalEvent))
                },
            })
            if (channel.readyState === 'open') channel.send(serializePairingPeerMessage(response))
        } catch (error) {
            if (channel.readyState === 'open') channel.send(serializeInvalidRequest(error))
        }
    }
}
