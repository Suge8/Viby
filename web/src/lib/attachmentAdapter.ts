import type { AttachmentAdapter, PendingAttachment, CompleteAttachment, Attachment } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import { SUPPORTED_ATTACHMENT_ACCEPT } from '@/lib/attachmentAccept'
import { createRandomId } from '@/lib/id'
import type { AttachmentMetadata } from '@/types/api'
import { isImageMimeType } from '@/lib/fileAttachments'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024

type PendingUploadAttachment = PendingAttachment & {
    path?: string
    previewUrl?: string
}

const IMAGE_EXTENSION_MIME_TYPES: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif'
}

const DOCUMENT_EXTENSION_MIME_TYPES: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    toml: 'application/toml',
    xml: 'application/xml',
    csv: 'text/csv',
    log: 'text/plain'
}

function getFileExtension(fileName: string): string {
    const lowerName = fileName.toLowerCase()
    const segments = lowerName.split('.')
    return segments.length > 1 ? segments.at(-1) ?? '' : ''
}

function guessAttachmentType(file: File): 'image' | 'document' | 'file' {
    const mimeType = file.type || ''
    if (isImageMimeType(mimeType)) {
        return 'image'
    }
    if (mimeType.startsWith('text/')) {
        return 'document'
    }

    const extension = getFileExtension(file.name)
    if (extension in IMAGE_EXTENSION_MIME_TYPES) {
        return 'image'
    }
    if (extension in DOCUMENT_EXTENSION_MIME_TYPES) {
        return 'document'
    }
    return 'file'
}

function resolveAttachmentContentType(
    file: File,
    type: 'image' | 'document' | 'file'
): string {
    const mimeType = file.type.trim()
    const extension = getFileExtension(file.name)

    if (type === 'image') {
        if (isImageMimeType(mimeType)) {
            return mimeType
        }

        const inferred = IMAGE_EXTENSION_MIME_TYPES[extension]
        return inferred ?? (mimeType || 'image/jpeg')
    }

    if (type === 'document') {
        if (mimeType.startsWith('text/')) {
            return mimeType
        }

        const inferred = DOCUMENT_EXTENSION_MIME_TYPES[extension]
        return inferred ?? (mimeType || 'text/plain')
    }

    return mimeType || 'application/octet-stream'
}

type CreateAttachmentAdapterOptions = {
    ensureSessionReady?: () => Promise<void>
}

export function createAttachmentAdapter(
    api: ApiClient,
    sessionId: string,
    options?: CreateAttachmentAdapterOptions
): AttachmentAdapter {
    const cancelledAttachmentIds = new Set<string>()

    const deleteUpload = async (targetSessionId: string, path?: string) => {
        if (!path) return
        try {
            await api.deleteUploadFile(targetSessionId, path)
        } catch {
            // Best effort cleanup
        }
    }

    return {
        accept: SUPPORTED_ATTACHMENT_ACCEPT,

        async *add({ file }): AsyncGenerator<PendingAttachment> {
            const id = createRandomId()
            const type = guessAttachmentType(file)
            const contentType = resolveAttachmentContentType(file, type)

            yield {
                id,
                type,
                name: file.name,
                contentType,
                file,
                status: { type: 'running', reason: 'uploading', progress: 0 }
            }

            try {
                if (cancelledAttachmentIds.has(id)) {
                    return
                }

                if (file.size > MAX_UPLOAD_BYTES) {
                    yield {
                        id,
                        type,
                        name: file.name,
                        contentType,
                        file,
                        status: { type: 'incomplete', reason: 'error' }
                    }
                    return
                }

                const content = await fileToBase64(file)
                if (cancelledAttachmentIds.has(id)) {
                    return
                }

                yield {
                    id,
                    type,
                    name: file.name,
                    contentType,
                    file,
                    status: { type: 'running', reason: 'uploading', progress: 50 }
                }

                await options?.ensureSessionReady?.()
                const result = await api.uploadFile(sessionId, file.name, content, contentType)
                if (cancelledAttachmentIds.has(id)) {
                    if (result.success && result.path) {
                        await deleteUpload(sessionId, result.path)
                    }
                    return
                }

                if (!result.success || !result.path) {
                    yield {
                        id,
                        type,
                        name: file.name,
                        contentType,
                        file,
                        status: { type: 'incomplete', reason: 'error' }
                    }
                    return
                }

                // 图片预览与图片发送共用同一套类型推断，避免移动端空 MIME 时前后语义分裂。
                let previewUrl: string | undefined
                if (type === 'image' && file.size <= MAX_PREVIEW_BYTES) {
                    previewUrl = await fileToDataUrl(file)
                }

                yield {
                    id,
                    type,
                    name: file.name,
                    contentType,
                    file,
                    status: { type: 'requires-action', reason: 'composer-send' },
                    path: result.path,
                    previewUrl
                } as PendingUploadAttachment
            } catch {
                yield {
                    id,
                    type,
                    name: file.name,
                    contentType,
                    file,
                    status: { type: 'incomplete', reason: 'error' }
                }
            }
        },

        async remove(attachment: Attachment): Promise<void> {
            cancelledAttachmentIds.add(attachment.id)
            const pendingAttachment = attachment as PendingUploadAttachment
            await deleteUpload(sessionId, pendingAttachment.path)
        },

        async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
            const pending = attachment as PendingUploadAttachment
            const path = pending.path

            // Build AttachmentMetadata to be sent with the message
            const metadata: AttachmentMetadata | undefined = path ? {
                id: attachment.id,
                filename: attachment.name,
                mimeType: attachment.contentType ?? 'application/octet-stream',
                size: attachment.file?.size ?? 0,
                path,
                previewUrl: pending.previewUrl
            } : undefined

            const metadataContent = metadata
                ? [{ type: 'text' as const, text: JSON.stringify({ __attachmentMetadata: metadata }) }]
                : []
            const imageContent = attachment.type === 'image'
                ? [{
                    type: 'image' as const,
                    image: pending.previewUrl ?? (attachment.file ? await fileToDataUrl(attachment.file) : ''),
                    filename: attachment.name
                }]
                : []

            return {
                id: attachment.id,
                type: attachment.type,
                name: attachment.name,
                contentType: attachment.contentType,
                status: { type: 'complete' },
                // Keep a sidecar metadata text part for the Viby send pipeline,
                // while exposing an image part so assistant-ui can treat photos as images.
                content: [...imageContent, ...metadataContent]
            }
        }
    }
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            const base64 = result.split(',')[1]
            if (!base64) {
                reject(new Error('Failed to read file'))
                return
            }
            resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            resolve(reader.result as string)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}
