import { describe, expect, it } from 'bun:test'
import {
    createPairingUploadChunkFrame,
    formatPairingUploadTransferId,
    isPairingUploadFrameMagic,
    PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG,
    PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES,
    PAIRING_BINARY_UPLOAD_FRAME_MAGIC,
    PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES,
    parsePairingUploadTransferId,
} from './pairingPeerBinaryUpload'

const TRANSFER_ID = '00000000-0000-4000-8000-000000000001'

describe('pairingPeerBinaryUpload', () => {
    it('keeps the binary upload frame contract canonical', () => {
        const payload = new Uint8Array([1, 2, 3]).buffer
        const frame = new Uint8Array(
            createPairingUploadChunkFrame({
                chunk: payload,
                chunkIndex: 7,
                final: true,
                transferId: TRANSFER_ID,
            })
        )

        expect(frame.slice(0, PAIRING_BINARY_UPLOAD_FRAME_MAGIC.length)).toEqual(PAIRING_BINARY_UPLOAD_FRAME_MAGIC)
        expect(formatPairingUploadTransferId(frame.slice(4, 4 + PAIRING_BINARY_UPLOAD_TRANSFER_ID_BYTES))).toBe(
            TRANSFER_ID
        )
        expect(new DataView(frame.buffer).getUint32(20, false)).toBe(7)
        expect(frame[24]).toBe(PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG)
        expect(frame.slice(PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES)).toEqual(new Uint8Array([1, 2, 3]))
        expect(isPairingUploadFrameMagic(frame)).toBe(true)
        expect(isPairingUploadFrameMagic(new Uint8Array([0, 0, 0, 0]))).toBe(false)
    })

    it('round-trips transfer ids without a web or desktop copy', () => {
        expect(formatPairingUploadTransferId(parsePairingUploadTransferId(TRANSFER_ID))).toBe(TRANSFER_ID)
    })

    it('fails malformed transfer ids before creating binary frames', () => {
        expect(() => parsePairingUploadTransferId('not-a-transfer-id')).toThrow('Upload transfer id must be a UUID.')
        expect(() => formatPairingUploadTransferId(new Uint8Array([1, 2, 3]))).toThrow(
            'Upload transfer id bytes must be 16 bytes.'
        )
    })
})
