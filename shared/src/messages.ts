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

export function extractCodexMessageItemId(value: unknown): string | null {
    const record = unwrapRoleWrappedRecordEnvelope(value)
    if (!record || record.role !== 'agent') {
        return null
    }

    if (!isObject(record.content) || record.content.type !== 'codex') {
        return null
    }

    const data = record.content.data
    if (!isObject(data) || data.type !== 'message') {
        return null
    }

    return typeof data.itemId === 'string' && data.itemId.length > 0
        ? data.itemId
        : null
}

export type { RoleWrappedRecord }
