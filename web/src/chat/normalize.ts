import { type RoleWrappedRecord, unwrapRoleWrappedRecordEnvelope } from '@viby/protocol/messages'
import { safeStringify } from '@viby/protocol/utils'
import { isRecognizedAgentContent, isSkippableAgentContent, normalizeAgentRecord } from '@/chat/normalizeAgent'
import { normalizeUserRecord } from '@/chat/normalizeUser'
import type { NormalizedMessage } from '@/chat/types'
import type { ClientMessage } from '@/types/api'

function withDurableMessageState(normalized: NormalizedMessage, message: ClientMessage): NormalizedMessage {
    return { ...normalized, status: message.status, originalText: message.originalText }
}

function createAgentTextMessage(message: ClientMessage, content: unknown, meta?: unknown): NormalizedMessage {
    return {
        id: message.id,
        localId: message.localId,
        createdAt: message.createdAt,
        role: 'agent',
        isSidechain: false,
        content: [{ type: 'text', text: safeStringify(content), uuid: message.id, parentUUID: null }],
        meta,
        status: message.status,
        originalText: message.originalText,
    }
}

function createUserTextMessage(message: ClientMessage, content: unknown, meta?: unknown): NormalizedMessage {
    return {
        id: message.id,
        localId: message.localId,
        createdAt: message.createdAt,
        role: 'user',
        isSidechain: false,
        content: { type: 'text', text: safeStringify(content) },
        meta,
        status: message.status,
        originalText: message.originalText,
    }
}

function normalizeRecognizedAgentMessage(
    message: ClientMessage,
    content: unknown,
    meta?: unknown
): NormalizedMessage | null | undefined {
    if (isSkippableAgentContent(content)) return null
    if (!isRecognizedAgentContent(content)) return undefined

    const normalized = normalizeAgentRecord(message.id, message.localId, message.createdAt, content, meta)
    return normalized ? withDurableMessageState(normalized, message) : null
}

function normalizeRoleWrappedMessage(message: ClientMessage, record: RoleWrappedRecord): NormalizedMessage | null {
    if (record.role === 'user') {
        const normalized = normalizeUserRecord(
            message.id,
            message.localId,
            message.createdAt,
            record.content,
            record.meta
        )
        return normalized
            ? withDurableMessageState(normalized, message)
            : createUserTextMessage(message, record.content, record.meta)
    }

    if (record.role === 'agent') {
        const normalized = normalizeRecognizedAgentMessage(message, record.content, record.meta)
        return normalized !== undefined ? normalized : createAgentTextMessage(message, record.content, record.meta)
    }

    return createAgentTextMessage(message, record.content, record.meta)
}

export function normalizeClientMessage(message: ClientMessage): NormalizedMessage | null {
    const topLevelAgentMessage = normalizeRecognizedAgentMessage(message, message.content)
    if (topLevelAgentMessage !== undefined) {
        return topLevelAgentMessage
    }

    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    return record ? normalizeRoleWrappedMessage(message, record) : createAgentTextMessage(message, message.content)
}
