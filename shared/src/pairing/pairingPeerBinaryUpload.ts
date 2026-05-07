export const PAIRING_BINARY_UPLOAD_FRAME_MAGIC = new Uint8Array([86, 66, 89, 49])
export const PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES = 25
export const PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES = 16
export const PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG = 1

export function formatPairingUploadTransferId(bytes: Uint8Array): string {
    if (bytes.byteLength !== PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES) {
        throw new Error('Upload transfer id bytes must be 16 bytes.')
    }
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function parsePairingUploadTransferId(transferId: string): Uint8Array {
    const hex = transferId.split('-').join('')
    if (hex.length !== PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES * 2) {
        throw new Error('Upload transfer id must be a UUID.')
    }
    const bytes = new Uint8Array(PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES)
    for (let index = 0; index < bytes.length; index += 1) {
        const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
        if (Number.isNaN(value)) {
            throw new Error('Upload transfer id must be a UUID.')
        }
        bytes[index] = value
    }
    return bytes
}

export function isPairingUploadFrameMagic(bytes: Uint8Array): boolean {
    return PAIRING_BINARY_UPLOAD_FRAME_MAGIC.every((value, index) => bytes[index] === value)
}

export function createPairingUploadChunkFrame(input: {
    chunk: ArrayBuffer
    chunkIndex: number
    final: boolean
    transferId: string
}): ArrayBuffer {
    const frame = new Uint8Array(PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES + input.chunk.byteLength)
    frame.set(PAIRING_BINARY_UPLOAD_FRAME_MAGIC, 0)
    frame.set(parsePairingUploadTransferId(input.transferId), 4)
    new DataView(frame.buffer).setUint32(20, input.chunkIndex, false)
    frame[24] = input.final ? PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG : 0
    frame.set(new Uint8Array(input.chunk), PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES)
    return frame.buffer
}
