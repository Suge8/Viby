import { isObject } from './utils'

type RoleWrappedRecord = {
    role: string
    content: unknown
    meta?: unknown
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

function extractCodexAssistantMessageStreamId(content: Record<string, unknown>): string | null {
    const data = content.data
    if (!isObject(data) || data.type !== 'message') {
        return null
    }

    return readNonEmptyString(data.itemId)
}

function extractPiAssistantMessageStreamId(content: Record<string, unknown>): string | null {
    const data = content.data
    if (!isObject(data) || data.type !== 'assistant' || !isObject(data.message)) {
        return null
    }

    return buildPiAssistantStreamId(data.message.responseId, data.message.timestamp)
}

export function buildPiAssistantStreamId(responseId: unknown, timestamp: unknown): string | null {
    const explicitResponseId = readNonEmptyString(responseId)
    if (explicitResponseId) {
        return explicitResponseId
    }

    return typeof timestamp === 'number' && Number.isFinite(timestamp)
        ? `pi-assistant-${timestamp}`
        : null
}

export function extractAssistantMessageStreamId(value: unknown): string | null {
    const record = unwrapRoleWrappedRecordEnvelope(value)
    if (!record || record.role !== 'agent' || !isObject(record.content)) {
        return null
    }

    switch (record.content.type) {
        case 'codex':
            return extractCodexAssistantMessageStreamId(record.content)
        case 'output':
            return extractPiAssistantMessageStreamId(record.content)
        default:
            return null
    }
}

export type { RoleWrappedRecord }
