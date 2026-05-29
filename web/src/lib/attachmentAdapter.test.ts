import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { createAttachmentAdapter, getCachedAttachmentAdapter } from '@/lib/attachmentAdapter'

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

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function installObjectUrlMocks() {
    const createObjectURL = vi.fn(() => 'blob:preview-url')
    const revokeObjectURL = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: revokeObjectURL,
    })

    return { createObjectURL, revokeObjectURL }
}

describe('createAttachmentAdapter', () => {
    afterEach(() => {
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            writable: true,
            value: originalCreateObjectURL,
        })
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            writable: true,
            value: originalRevokeObjectURL,
        })
        vi.restoreAllMocks()
    })

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

    it('uploads files as binary blobs and revokes local previews on cleanup', async () => {
        const { revokeObjectURL } = installObjectUrlMocks()
        const api = {
            uploadFile: vi.fn().mockResolvedValue({ success: true, path: '/tmp/uploaded.png' }),
            deleteUploadFile: vi.fn().mockResolvedValue({ success: true }),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        const file = new File(['image-bytes'], 'screenshot.png', { type: 'image/png' })

        const states = await collectAttachmentStates(adapter, file)
        const pendingAttachment = states.at(-1)

        expect(api.uploadFile).toHaveBeenCalledWith('session-1', file, 'image/png')
        expect(pendingAttachment).toMatchObject({
            status: { type: 'requires-action', reason: 'composer-send' },
            path: '/tmp/uploaded.png',
            previewUrl: 'blob:preview-url',
        })

        await adapter.remove(pendingAttachment as never)

        expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-url')
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
        expect(JSON.parse((metadataText as { text: string }).text)).toEqual({
            __attachmentMetadata: {
                id: pendingAttachment?.id,
                filename: 'notes.txt',
                mimeType: 'text/plain',
                size: 5,
                path: '/tmp/uploaded.txt',
            },
        })
    })

    it('does not persist inline image previews into durable attachment metadata', async () => {
        const { revokeObjectURL } = installObjectUrlMocks()
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
            status: { type: 'requires-action', reason: 'composer-send' },
            previewUrl: 'blob:preview-url',
        })

        const completeAttachment = await adapter.send(pendingAttachment as never)
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-url')
        expect(completeAttachment.type).toBe('image')
        expect(completeAttachment.content).toHaveLength(1)
        expect(completeAttachment.content[0]).toMatchObject({ type: 'text' })
        expect(JSON.parse((completeAttachment.content[0] as { text: string }).text)).toEqual({
            __attachmentMetadata: {
                id: pendingAttachment?.id,
                filename: 'photo.jpg',
                mimeType: 'image/jpeg',
                size: file.size,
                path: '/tmp/uploaded.png',
            },
        })
    })

    it('surfaces a `tooLarge` descriptor when the file is rejected before upload by client-side size check', async () => {
        const api = {
            uploadFile: vi.fn(),
            deleteUploadFile: vi.fn(),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        // 51 MB > 50 MB ceiling, so the adapter must short-circuit with a
        // tooLarge descriptor instead of forwarding the request. The chip
        // tooltip then renders `文件过大 (51.0MB > 上限 50MB)` for the user.
        const oversize = new File([new Uint8Array(51 * 1024 * 1024)], 'huge.png', { type: 'image/png' })

        const states = await collectAttachmentStates(adapter, oversize)
        const last = states.at(-1) as { status?: { type?: string }; errorDescriptor?: unknown }

        expect(last.status?.type).toBe('incomplete')
        expect(last.errorDescriptor).toEqual({
            titleKey: 'composer.attachment.error.tooLarge',
            titleParams: { actual: '51.0MB', max: '50MB' },
        })
        expect(api.uploadFile).not.toHaveBeenCalled()
    })

    it('classifies a server 413 reply as the tooLarge descriptor so the tooltip explains the cap', async () => {
        const api = {
            uploadFile: vi.fn().mockRejectedValue(new ApiError('Request Entity Too Large', 413)),
            deleteUploadFile: vi.fn(),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        const file = new File(['x'], 'photo.png', { type: 'image/png' })
        const states = await collectAttachmentStates(adapter, file)
        const last = states.at(-1) as { errorDescriptor?: { titleKey?: string } }
        expect(last.errorDescriptor?.titleKey).toBe('composer.attachment.error.tooLarge')
    })

    it('classifies arbitrary upload failures into uploadFailed with HTTP status + message', async () => {
        const api = {
            uploadFile: vi.fn().mockRejectedValue(new ApiError('boom', 500)),
            deleteUploadFile: vi.fn(),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        const file = new File(['x'], 'photo.png', { type: 'image/png' })
        const states = await collectAttachmentStates(adapter, file)
        const last = states.at(-1) as { errorDescriptor?: { titleKey?: string; titleParams?: { status?: number } } }
        expect(last.errorDescriptor?.titleKey).toBe('composer.attachment.error.uploadFailed')
        expect(last.errorDescriptor?.titleParams?.status).toBe(500)
    })

    it('classifies network-level errors (no HTTP status) as networkError descriptor', async () => {
        const api = {
            uploadFile: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
            deleteUploadFile: vi.fn(),
        }
        const adapter = createAttachmentAdapter(api as never, 'session-1')
        const file = new File(['x'], 'photo.png', { type: 'image/png' })
        const states = await collectAttachmentStates(adapter, file)
        const last = states.at(-1) as { errorDescriptor?: { titleKey?: string } }
        expect(last.errorDescriptor?.titleKey).toBe('composer.attachment.error.networkError')
    })

    it('reuses the same adapter instance for the same api/session pair', () => {
        const api = {
            uploadFile: vi.fn(),
            deleteUploadFile: vi.fn(),
        }

        const first = getCachedAttachmentAdapter(api as never, 'session-1')
        const second = getCachedAttachmentAdapter(api as never, 'session-1')
        const third = getCachedAttachmentAdapter(api as never, 'session-2')

        expect(first).toBe(second)
        expect(first).not.toBe(third)
    })
})
