import { SESSION_ATTACHMENT_MAX_UPLOAD_BYTES } from '@viby/protocol'
import type {
    PairingPeerUploadCompleteParams,
    PairingPeerUploadResult,
    PairingPeerUploadStartParams,
} from '@viby/protocol/pairing'
import {
    formatPairingUploadTransferId,
    isPairingUploadFrameMagic,
    PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG,
    PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES,
    PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES,
} from '@viby/protocol/pairing'

type UploadTransfer = PairingPeerUploadStartParams & {
    chunks: ArrayBuffer[]
    receivedBytes: number
    nextChunkIndex: number
    complete: boolean
    failedReason?: string
}

function copyChunkPayload(payload: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(payload.byteLength)
    copy.set(payload)
    return copy.buffer
}

async function toArrayBuffer(data: unknown): Promise<ArrayBuffer | null> {
    if (data instanceof ArrayBuffer) {
        return data
    }
    if (data instanceof Blob) {
        return await data.arrayBuffer()
    }
    return null
}

export class PairingBinaryUploadManager {
    private readonly transfers = new Map<string, UploadTransfer>()

    begin(params: PairingPeerUploadStartParams): void {
        if (params.size > SESSION_ATTACHMENT_MAX_UPLOAD_BYTES) {
            throw new Error('Upload transfer exceeds the session attachment size limit.')
        }
        this.transfers.set(params.transferId, {
            ...params,
            chunks: [],
            receivedBytes: 0,
            nextChunkIndex: 0,
            complete: params.size === 0,
        })
    }

    cancel(transferId: string): void {
        this.transfers.delete(transferId)
    }

    clear(): void {
        this.transfers.clear()
    }

    async accept(data: unknown): Promise<boolean> {
        const frame = await this.parseFrame(data)
        if (!frame) {
            return false
        }
        const transfer = this.transfers.get(frame.transferId)
        if (!transfer) {
            return true
        }
        if (frame.chunkIndex !== transfer.nextChunkIndex) {
            transfer.failedReason = 'Upload transfer chunk order is invalid.'
            return true
        }
        transfer.chunks.push(copyChunkPayload(frame.payload))
        transfer.receivedBytes += frame.payload.byteLength
        transfer.nextChunkIndex += 1
        transfer.complete = frame.final
        return true
    }

    async complete(
        params: PairingPeerUploadCompleteParams,
        upload: (file: Blob, filename: string, mimeType: string) => Promise<PairingPeerUploadResult>
    ): Promise<PairingPeerUploadResult> {
        const transfer = this.transfers.get(params.transferId)
        if (!transfer || transfer.sessionId !== params.sessionId) {
            throw new Error('Upload transfer is not available.')
        }
        if (transfer.failedReason) {
            this.transfers.delete(params.transferId)
            throw new Error(transfer.failedReason)
        }
        if (!transfer.complete || transfer.receivedBytes !== transfer.size) {
            throw new Error('Upload transfer is incomplete.')
        }

        this.transfers.delete(params.transferId)
        const blob = new Blob(transfer.chunks, { type: transfer.mimeType })
        return await upload(blob, transfer.filename, transfer.mimeType)
    }

    private async parseFrame(data: unknown): Promise<{
        final: boolean
        chunkIndex: number
        transferId: string
        payload: Uint8Array
    } | null> {
        const buffer = await toArrayBuffer(data)
        if (!buffer || buffer.byteLength < PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES) {
            return null
        }

        const bytes = new Uint8Array(buffer)
        if (!isPairingUploadFrameMagic(bytes)) {
            return null
        }

        const view = new DataView(buffer)
        const transferIdStart = 4
        const transferIdEnd = transferIdStart + PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES
        return {
            final: bytes[24] === PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG,
            chunkIndex: view.getUint32(20, false),
            transferId: formatPairingUploadTransferId(bytes.subarray(transferIdStart, transferIdEnd)),
            payload: bytes.subarray(PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES),
        }
    }
}
