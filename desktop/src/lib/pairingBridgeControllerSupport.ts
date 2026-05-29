import { createPairingPeerTextAssembler } from '@viby/protocol/pairing'
import type { LocalHubPairingClient } from './localHubPairingClient'
import {
    createDataChannelTextSink,
    handlePairingPeerPayload,
    isHubPausedError,
    type PairingPeerTextSink,
} from './pairingPeerPayloadSupport'

export type { PairingPeerTextSink } from './pairingPeerPayloadSupport'
export {
    canSendPairingPeerText,
    HubPausedError,
    handlePairingPeerPayload,
    isHubPausedError,
    sendPairingPeerText,
} from './pairingPeerPayloadSupport'

export function attachPairingDataChannel(options: {
    channel: RTCDataChannel
    getClient: () => LocalHubPairingClient
    isDisposed: () => boolean
    onChannelOpen: () => void
    onChannelActive: () => void
    onChannelClosed: () => void
    startEventStream: (sink: PairingPeerTextSink) => Promise<void>
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
    const sink = createDataChannelTextSink(channel)
    const textAssembler = createPairingPeerTextAssembler()
    channel.addEventListener('open', () => {
        onChannelOpen()
        void startEventStream(sink).catch((error) => reportAsyncError('配对事件流启动失败：', error))
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
            textAssembler,
            onSendError: (error) => reportAsyncError('配对发送失败：', error),
            sink,
        }).catch((error) => reportAsyncError('配对请求处理失败：', error))
    })
}

function closeAllTerminals(getClient: () => LocalHubPairingClient): void {
    try {
        getClient().closeAllTerminals()
    } catch (error) {
        if (!isHubPausedError(error)) throw error
    }
}
