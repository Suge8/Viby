import type { PairingPeerRequest } from '@viby/protocol'
import { PairingPeerUploadResultSchema } from '@viby/protocol'
import { createPairingUploadChunkFrame } from '@viby/protocol/pairing'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import {
    createRemotePairingCodedError,
    getRemotePairingErrorKey,
    type RemotePairingErrorKey,
} from './remotePairingErrors'
import { createRemotePeerRequest } from './remotePairingRpc'

const CHUNK_BYTES = 16 * 1024
const BUFFERED_AMOUNT_HIGH_BYTES = 512 * 1024
const BUFFERED_AMOUNT_LOW_BYTES = 128 * 1024

type RequestPeer = <T>(request: PairingPeerRequest, parse: (value: unknown) => T) => Promise<T>

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
            reject(createRemotePairingCodedError('remotePairing.error.peerNotConnected'))
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

export async function uploadRemoteFile(options: {
    channel: RTCDataChannel | null
    requestPeer: RequestPeer
    sessionId: string
    file: File
    mimeType: string
}): Promise<{ success: boolean; path?: string; error?: string }> {
    const { channel, file, mimeType, requestPeer, sessionId } = options
    if (!channel || channel.readyState !== 'open') {
        return { success: false, error: 'remotePairing.error.peerNotConnected' }
    }

    const transferId = crypto.randomUUID()
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
            await waitForBufferedAmountLow(channel)
            const chunk = await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer()
            const final = offset + CHUNK_BYTES >= file.size
            channel.send(createPairingUploadChunkFrame({ chunk, chunkIndex, final, transferId }))
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
