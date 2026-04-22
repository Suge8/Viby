import type { AttachmentMetadata } from './schemas'
import { isObject } from './utils'

type RoleWrappedRecord = {
    role: string
    content: unknown
    meta?: unknown
}

export const SYSTEM_INJECTED_PSEUDO_USER_PREFIXES = [
    '<task-notification>',
    '<command-name>',
    '<local-command-caveat>',
    '<system-reminder>',
] as const

export function isSystemInjectedPseudoUserText(value: unknown): boolean {
    if (typeof value !== 'string') {
        return false
    }
    const trimmed = value.trimStart()
    return SYSTEM_INJECTED_PSEUDO_USER_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

export function isRoleWrappedRecord(value: unknown): value is RoleWrappedRecord {
    if (!isObject(value)) return false
    return typeof value.role === 'string' && 'content' in value
}

export function unwrapRoleWrappedRecordEnvelope(value: unknown): RoleWrappedRecord | null {
    if (isRoleWrappedRecord(value)) return value
    if (!isObject(value)) return null

    const direct = value.message
    if (isRoleWrappedRecord(direct)) return direct

    const data = value.data
    if (isObject(data) && isRoleWrappedRecord(data.message)) return data.message as RoleWrappedRecord

    const payload = value.payload
    if (isObject(payload) && isRoleWrappedRecord(payload.message)) return payload.message as RoleWrappedRecord

    return null
}

function readNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function readAssistantTurnIdMeta(value: unknown): string | null {
    return isObject(value) ? readNonEmptyString(value.assistantTurnId) : null
}

export function buildPiAssistantTurnId(responseId: unknown, timestamp: unknown): string | null {
    const explicitResponseId = readNonEmptyString(responseId)
    if (explicitResponseId) {
        return explicitResponseId
    }

    return typeof timestamp === 'number' && Number.isFinite(timestamp) ? `pi-assistant-${timestamp}` : null
}

export function extractAssistantTurnId(value: unknown): string | null {
    const record = unwrapRoleWrappedRecordEnvelope(value)
    if (!record || record.role !== 'agent') {
        return null
    }

    return readAssistantTurnIdMeta(record.meta)
}

export type { RoleWrappedRecord }

export function isHiddenAgentMetaOutput(value: unknown): boolean {
    const record = unwrapRoleWrappedRecordEnvelope(value)
    if (!record || record.role !== 'agent' || !isObject(record.content)) {
        return false
    }

    if (record.content.type !== 'output' || !isObject(record.content.data)) {
        return false
    }

    return record.content.data.isMeta === true
}

export function sanitizeDurableAttachmentPreviewUrl(previewUrl: unknown): string | undefined {
    if (typeof previewUrl !== 'string' || previewUrl.length === 0) {
        return undefined
    }

    return previewUrl.startsWith('data:') ? undefined : previewUrl
}

export function sanitizeDurableAttachmentMetadata(attachment: AttachmentMetadata): AttachmentMetadata {
    const previewUrl = sanitizeDurableAttachmentPreviewUrl(attachment.previewUrl)
    if (previewUrl === attachment.previewUrl) {
        return attachment
    }

    return previewUrl
        ? { ...attachment, previewUrl }
        : {
              id: attachment.id,
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              size: attachment.size,
              path: attachment.path,
          }
}

export function sanitizeDurableAttachmentMetadataList(
    attachments: readonly AttachmentMetadata[] | undefined
): AttachmentMetadata[] | undefined {
    if (!attachments || attachments.length === 0) {
        return undefined
    }

    let changed = false
    const nextAttachments = attachments.map((attachment) => {
        const sanitized = sanitizeDurableAttachmentMetadata(attachment)
        if (sanitized !== attachment) {
            changed = true
        }
        return sanitized
    })

    return changed ? nextAttachments : [...attachments]
}
