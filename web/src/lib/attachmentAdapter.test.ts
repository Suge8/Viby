import { describe, expect, it, vi } from 'vitest'
import { createAttachmentAdapter } from '@/lib/attachmentAdapter'

async function collectAttachmentStates(adapter: ReturnType<typeof createAttachmentAdapter>, file: File) {
    const states = []
    const addResult = adapter.add({ file })

    if (Symbol.asyncIterator in addResult) {
        for await (const state of addResult) {
            states.push(state)
        }
        return states
    }

    states.push(await addResult)
    return states
}

describe('createAttachmentAdapter', () => {
    it('exposes an explicit accept list instead of a wildcard picker', () => {
        const api = {
            uploadFile: vi.fn(),
            deleteUploadFile: vi.fn(),
        }

        const adapter = createAttachmentAdapter(api as never, 'session-1')

        expect(adapter.accept).toContain('image/*')
        expect(adapter.accept).toContain('.heic')
        expect(adapter.accept).not.toBe('*')
        expect(adapter.accept).not.toBe('*/*')
    })

    it('uploads and cleans up against the same session id', async () => {
        const api = {
            uploadFile: vi.fn().mockResolvedValue({ success: true, path: '/tmp/uploaded.png' }),
            deleteUploadFile: vi.fn().mockResolvedValue({ success: true }),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        const file = new File(['image-bytes'], 'screenshot.png', { type: 'image/png' })

        const states = await collectAttachmentStates(adapter, file)
        const pendingAttachment = states.at(-1)

        expect(api.uploadFile).toHaveBeenCalledWith('session-1', 'screenshot.png', expect.any(String), 'image/png')
        expect(pendingAttachment).toMatchObject({
            status: { type: 'requires-action', reason: 'composer-send' },
            path: '/tmp/uploaded.png'
        })

        await adapter.remove(pendingAttachment as never)

        expect(api.deleteUploadFile).toHaveBeenCalledWith('session-1', '/tmp/uploaded.png')
    })

    it('serializes attachment metadata into assistant-ui attachment content', async () => {
        const api = {
            uploadFile: vi.fn().mockResolvedValue({ success: true, path: '/tmp/uploaded.txt' }),
            deleteUploadFile: vi.fn().mockResolvedValue({ success: true }),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })
        const states = await collectAttachmentStates(adapter, file)
        const pendingAttachment = states.at(-1)

        const completeAttachment = await adapter.send(pendingAttachment as never)
        const metadataText = completeAttachment.content[0]

        expect(metadataText).toMatchObject({ type: 'text' })
        expect(
            JSON.parse((metadataText as { text: string }).text)
        ).toEqual({
            __attachmentMetadata: {
                id: pendingAttachment?.id,
                filename: 'notes.txt',
                mimeType: 'text/plain',
                size: 5,
                path: '/tmp/uploaded.txt'
            }
        })
    })

    it('marks image uploads as image attachments and keeps both preview and metadata on send', async () => {
        const api = {
            uploadFile: vi.fn().mockResolvedValue({ success: true, path: '/tmp/uploaded.png' }),
            deleteUploadFile: vi.fn().mockResolvedValue({ success: true }),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        const file = new File(['image-bytes'], 'photo.jpg')
        const states = await collectAttachmentStates(adapter, file)
        const pendingAttachment = states.at(-1)

        expect(pendingAttachment).toMatchObject({
            type: 'image',
            contentType: 'image/jpeg',
            status: { type: 'requires-action', reason: 'composer-send' }
        })

        const completeAttachment = await adapter.send(pendingAttachment as never)
        expect(completeAttachment.type).toBe('image')
        expect(completeAttachment.content[0]).toMatchObject({ type: 'image' })
        expect(completeAttachment.content[1]).toMatchObject({ type: 'text' })
        expect(
            JSON.parse((completeAttachment.content[1] as { text: string }).text)
        ).toEqual({
            __attachmentMetadata: {
                id: pendingAttachment?.id,
                filename: 'photo.jpg',
                mimeType: 'image/jpeg',
                size: file.size,
                path: '/tmp/uploaded.png',
                previewUrl: expect.any(String)
            }
        })
    })
})
