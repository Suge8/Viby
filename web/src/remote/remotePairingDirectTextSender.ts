import {
    createPairingPeerTextSender,
    PAIRING_PEER_TEXT_CHUNK_BYTES,
    type PairingPeerTextSender,
    type PairingPeerTextWritable,
} from '@viby/protocol/pairing'

export function createRemoteDirectTextSender(channel: RTCDataChannel): PairingPeerTextSender {
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
    return createPairingPeerTextSender(writable)
}

export const REMOTE_DIRECT_TEXT_CHUNK_BYTES = PAIRING_PEER_TEXT_CHUNK_BYTES
