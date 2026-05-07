import { describe, expect, it } from 'bun:test'
import { SESSION_ATTACHMENT_MAX_UPLOAD_BYTES } from '@viby/protocol'
import { createPairingUploadChunkFrame } from '@viby/protocol/pairing'
import { PairingBinaryUploadManager } from './pairingBinaryUpload'

const TRANSFER_ID = '00000000-0000-4000-8000-000000000001'

function createFrame(input: { chunk: Uint8Array; chunkIndex: number; final?: boolean }): ArrayBuffer {
    return createPairingUploadChunkFrame({
        chunk: input.chunk.buffer.slice(input.chunk.byteOffset, input.chunk.byteOffset + input.chunk.byteLength),
        chunkIndex: input.chunkIndex,
        final: input.final ?? false,
        transferId: TRANSFER_ID,
    })
}

function begin(manager: PairingBinaryUploadManager, size: number): void {
    manager.begin({
        sessionId: 'session-1',
        transferId: TRANSFER_ID,
        filename: 'image.png',
        mimeType: 'image/png',
        size,
    })
}

async function readBlob(blob: Blob): Promise<string> {
    return await blob.text()
}

describe('PairingBinaryUploadManager', () => {
    it('assembles ordered binary chunks into the Hub upload Blob', async () => {
        const manager = new PairingBinaryUploadManager()
        begin(manager, 10)

        await expect(
            manager.accept(createFrame({ chunk: new TextEncoder().encode('hello'), chunkIndex: 0 }))
        ).resolves.toBe(true)
        await expect(
            manager.accept(createFrame({ chunk: new TextEncoder().encode('world'), chunkIndex: 1, final: true }))
        ).resolves.toBe(true)

        const result = await manager.complete({ sessionId: 'session-1', transferId: TRANSFER_ID }, async (blob) => {
            expect(blob.type).toBe('image/png')
            expect(await readBlob(blob)).toBe('helloworld')
            return { success: true, path: '/tmp/uploaded.png' }
        })

        expect(result).toEqual({ success: true, path: '/tmp/uploaded.png' })
    })

    it('rejects complete when not all bytes arrived', async () => {
        const manager = new PairingBinaryUploadManager()
        begin(manager, 10)

        await manager.accept(createFrame({ chunk: new TextEncoder().encode('hello'), chunkIndex: 0, final: true }))

        await expect(
            manager.complete({ sessionId: 'session-1', transferId: TRANSFER_ID }, async () => ({ success: true }))
        ).rejects.toThrow('Upload transfer is incomplete.')
    })

    it('fails out-of-order chunks instead of silently completing corrupted uploads', async () => {
        const manager = new PairingBinaryUploadManager()
        begin(manager, 10)

        await manager.accept(createFrame({ chunk: new TextEncoder().encode('world'), chunkIndex: 1, final: true }))
        await manager.accept(createFrame({ chunk: new TextEncoder().encode('hello'), chunkIndex: 0 }))

        await expect(
            manager.complete({ sessionId: 'session-1', transferId: TRANSFER_ID }, async () => ({ success: true }))
        ).rejects.toThrow('Upload transfer chunk order is invalid.')
    })

    it('keeps unknown binary frames out of the upload path', async () => {
        const manager = new PairingBinaryUploadManager()
        begin(manager, 0)

        const unknownFrame = new Uint8Array([1, 2, 3, 4]).buffer

        await expect(manager.accept(unknownFrame)).resolves.toBe(false)
    })

    it('supports zero-byte uploads without requiring a chunk frame', async () => {
        const manager = new PairingBinaryUploadManager()
        begin(manager, 0)

        const result = await manager.complete({ sessionId: 'session-1', transferId: TRANSFER_ID }, async (blob) => {
            expect(blob.size).toBe(0)
            return { success: true, path: '/tmp/empty.txt' }
        })

        expect(result).toEqual({ success: true, path: '/tmp/empty.txt' })
    })

    it('clears canceled transfers before they can allocate Hub upload work', async () => {
        const manager = new PairingBinaryUploadManager()
        begin(manager, 5)

        manager.cancel(TRANSFER_ID)

        await expect(
            manager.complete({ sessionId: 'session-1', transferId: TRANSFER_ID }, async () => ({ success: true }))
        ).rejects.toThrow('Upload transfer is not available.')
    })

    it('rejects oversized transfers before accepting binary chunks', () => {
        const manager = new PairingBinaryUploadManager()

        expect(() =>
            manager.begin({
                sessionId: 'session-1',
                transferId: TRANSFER_ID,
                filename: 'large.bin',
                mimeType: 'application/octet-stream',
                size: SESSION_ATTACHMENT_MAX_UPLOAD_BYTES + 1,
            })
        ).toThrow('Upload transfer exceeds the session attachment size limit.')
    })
})
