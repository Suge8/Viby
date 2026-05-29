import type { PairingPeerRequest } from '@viby/protocol'
import { PairingPeerUploadResultSchema } from '@viby/protocol'
import { createPairingUploadChunkFrame } from '@viby/protocol/pairing'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import {
    createRemotePairingCodedError,
    getRemotePairingErrorKey,
    type RemotePairingErrorKey,
} from './remotePairingErrors'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { createRemotePeerRequest } from './remotePairingRpc'

const CHUNK_BYTES = 16 * 1024
const BUFFERED_AMOUNT_HIGH_BYTES = 512 * 1024
const BUFFERED_AMOUNT_LOW_BYTES = 128 * 1024

type RequestPeer = <T>(request: PairingPeerRequest, parse: (value: unknown) => T) => Promise<T>

type UploadSender = { kind: 'channel'; channel: RTCDataChannel } | { kind: 'relay'; relay: RemotePairingRelaySocket }

function waitForBufferedAmountLow(channel: RTCDataChannel): Promise<void> {
    if (channel.bufferedAmount <= BUFFERED_AMOUNT_HIGH_BYTES) {
        return Promise.resolve()
    }
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_BYTES
    return new Promise((resolve, reject) => {
        const cleanup = (): void => {
            channel.removeEventListener('bufferedamountlow', handleLow)
            channel.removeEventListener('close', handleClose)
        }
        const handleLow = (): void => {
            cleanup()
            resolve()
        }
        const handleClose = (): void => {
            cleanup()
            reject(createRemotePairingCodedError('remotePairing.error.peerRequestFailed'))
        }
        channel.addEventListener('bufferedamountlow', handleLow)
        channel.addEventListener('close', handleClose, { once: true })
    })
}

async function cancelRemoteUpload(requestPeer: RequestPeer, transferId: string): Promise<void> {
    try {
        await requestPeer(createRemotePeerRequest('session.upload-cancel', { transferId }), () => undefined)
    } catch (error) {
        reportWebRuntimeError('Remote upload cancel failed.', error)
    }
}

function getUploadErrorKey(error: unknown): RemotePairingErrorKey {
    return getRemotePairingErrorKey(error) ?? 'remotePairing.error.uploadFailed'
}

function pickUploadSender(options: {
    channel: RTCDataChannel | null
    relay: RemotePairingRelaySocket | null
}): UploadSender | null {
    if (options.channel?.readyState === 'open') return { kind: 'channel', channel: options.channel }
    if (options.relay?.readyState === 'open') return { kind: 'relay', relay: options.relay }
    return null
}

async function sendUploadChunk(
    sender: UploadSender,
    params: { transferId: string; chunkIndex: number; chunkCount: number; chunk: ArrayBuffer; final: boolean }
): Promise<void> {
    if (sender.kind === 'channel') {
        await waitForBufferedAmountLow(sender.channel)
        sender.channel.send(
            createPairingUploadChunkFrame({
                chunk: params.chunk,
                chunkIndex: params.chunkIndex,
                final: params.final,
                transferId: params.transferId,
            })
        )
        return
    }
    // Relay path: the desktop bridge re-hydrates the magic frame after
    // decrypting, so we ship the raw chunk plus its index/count metadata.
    // `bytesBase64` carries the chunk bytes; the desktop side reconstructs
    // the same magic-headered ArrayBuffer that the datachannel path emits.
    await sender.relay.sendBinaryChunk({
        transferId: params.transferId,
        chunkIndex: params.chunkIndex,
        chunkCount: params.chunkCount,
        bytes: new Uint8Array(params.chunk),
    })
}

export async function uploadRemoteFile(options: {
    channel: RTCDataChannel | null
    relay: RemotePairingRelaySocket | null
    requestPeer: RequestPeer
    sessionId: string
    file: File
    mimeType: string
}): Promise<{ success: boolean; path?: string; error?: string }> {
    const { file, mimeType, requestPeer, sessionId } = options
    const sender = pickUploadSender({ channel: options.channel, relay: options.relay })
    if (!sender) {
        return { success: false, error: 'remotePairing.error.peerRequestFailed' }
    }

    const transferId = crypto.randomUUID()
    const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_BYTES))
    await requestPeer(
        createRemotePeerRequest('session.upload-start', {
            sessionId,
            transferId,
            filename: file.name,
            mimeType,
            size: file.size,
        }),
        () => undefined
    )

    try {
        let chunkIndex = 0
        for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
            const chunk = await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer()
            const final = offset + CHUNK_BYTES >= file.size
            await sendUploadChunk(sender, { transferId, chunkIndex, chunkCount, chunk, final })
            chunkIndex += 1
        }
        return await requestPeer(
            createRemotePeerRequest('session.upload-complete', { sessionId, transferId }),
            PairingPeerUploadResultSchema.parse
        )
    } catch (error) {
        await cancelRemoteUpload(requestPeer, transferId)
        return { success: false, error: getUploadErrorKey(error) }
    }
}
