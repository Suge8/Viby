import type { Attachment, AttachmentAdapter, CompleteAttachment, PendingAttachment } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import { SUPPORTED_ATTACHMENT_ACCEPT } from '@/lib/attachmentAccept'
import { createObjectPreviewUrl, revokeObjectPreviewUrl } from '@/lib/attachmentPreviews'
import { isImageMimeType } from '@/lib/fileAttachments'
import { createRandomId } from '@/lib/id'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import type { AttachmentMetadata } from '@/types/api'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

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
    avif: 'image/avif',
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
    log: 'text/plain',
}

const sessionAttachmentAdapterCache = new WeakMap<ApiClient, Map<string, AttachmentAdapter>>()

function getFileExtension(fileName: string): string {
    const lowerName = fileName.toLowerCase()
    const segments = lowerName.split('.')
    return segments.length > 1 ? (segments.at(-1) ?? '') : ''
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

function resolveAttachmentContentType(file: File, type: 'image' | 'document' | 'file'): string {
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

export function createAttachmentAdapter(api: ApiClient, sessionId: string): AttachmentAdapter {
    const cancelledAttachmentIds = new Set<string>()

    const deleteUpload = async (path?: string) => {
        if (!path) return
        try {
            await api.deleteUploadFile(sessionId, path)
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
            const previewUrl = type === 'image' ? createObjectPreviewUrl(file) : undefined

            yield {
                id,
                type,
                name: file.name,
                contentType,
                file,
                previewUrl,
                status: { type: 'running', reason: 'uploading', progress: 0 },
            } as PendingUploadAttachment

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
                        previewUrl,
                        status: { type: 'incomplete', reason: 'error' },
                    } as PendingUploadAttachment
                    return
                }

                yield {
                    id,
                    type,
                    name: file.name,
                    contentType,
                    file,
                    previewUrl,
                    status: { type: 'running', reason: 'uploading', progress: 50 },
                } as PendingUploadAttachment

                const result = await api.uploadFile(sessionId, file, contentType)
                if (cancelledAttachmentIds.has(id)) {
                    if (result.success && result.path) {
                        await deleteUpload(result.path)
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
                        previewUrl,
                        status: { type: 'incomplete', reason: 'error' },
                    } as PendingUploadAttachment
                    return
                }

                yield {
                    id,
                    type,
                    name: file.name,
                    contentType,
                    file,
                    status: { type: 'requires-action', reason: 'composer-send' },
                    path: result.path,
                    previewUrl,
                } as PendingUploadAttachment
            } catch (error) {
                reportWebRuntimeError('Attachment upload failed.', error)
                yield {
                    id,
                    type,
                    name: file.name,
                    contentType,
                    file,
                    previewUrl,
                    status: { type: 'incomplete', reason: 'error' },
                } as PendingUploadAttachment
            }
        },

        async remove(attachment: Attachment): Promise<void> {
            cancelledAttachmentIds.add(attachment.id)
            const pendingAttachment = attachment as PendingUploadAttachment
            revokeObjectPreviewUrl(pendingAttachment.previewUrl)
            await deleteUpload(pendingAttachment.path)
        },

        async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
            const pending = attachment as PendingUploadAttachment
            const path = pending.path

            revokeObjectPreviewUrl(pending.previewUrl)

            const metadata: AttachmentMetadata | undefined = path
                ? {
                      id: attachment.id,
                      filename: attachment.name,
                      mimeType: attachment.contentType ?? 'application/octet-stream',
                      size: attachment.file?.size ?? 0,
                      path,
                  }
                : undefined

            const metadataContent = metadata
                ? [{ type: 'text' as const, text: JSON.stringify({ __attachmentMetadata: metadata }) }]
                : []

            return {
                id: attachment.id,
                type: attachment.type,
                name: attachment.name,
                contentType: attachment.contentType,
                status: { type: 'complete' },
                // Durable transcript metadata must not carry inline data previews.
                content: metadataContent,
            }
        },
    }
}

export function getCachedAttachmentAdapter(api: ApiClient, sessionId: string): AttachmentAdapter {
    let sessionMap = sessionAttachmentAdapterCache.get(api)
    if (!sessionMap) {
        sessionMap = new Map()
        sessionAttachmentAdapterCache.set(api, sessionMap)
    }

    const cachedAdapter = sessionMap.get(sessionId)
    if (cachedAdapter) {
        return cachedAdapter
    }

    const adapter = createAttachmentAdapter(api, sessionId)
    sessionMap.set(sessionId, adapter)
    return adapter
}

export type AttachmentAdapterModule = {
    getCachedAttachmentAdapter: typeof getCachedAttachmentAdapter
}
