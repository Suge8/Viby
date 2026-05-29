import type { PairingPeerTextSender } from '@viby/protocol/pairing'
import { createRemoteDirectTextSender } from './remotePairingDirectTextSender'

export function attachRemotePeerDirectChannel(options: {
    channel: RTCDataChannel
    previousChannel: RTCDataChannel | null
    isCurrentChannel(channel: RTCDataChannel): boolean
    onClose(channel: RTCDataChannel): void
    onMessage(data: unknown, channel: RTCDataChannel): void
    onOpen(channel: RTCDataChannel): void
}): PairingPeerTextSender {
    const { channel, previousChannel } = options
    const textSender = createRemoteDirectTextSender(channel)
    if (previousChannel && previousChannel !== channel) previousChannel.close()
    channel.addEventListener('open', () => {
        if (options.isCurrentChannel(channel)) options.onOpen(channel)
    })
    channel.addEventListener('message', (event) => {
        if (options.isCurrentChannel(channel)) options.onMessage(event.data, channel)
    })
    channel.addEventListener('close', () => {
        if (options.isCurrentChannel(channel)) options.onClose(channel)
    })
    if (channel.readyState === 'open') options.onOpen(channel)
    return textSender
}
