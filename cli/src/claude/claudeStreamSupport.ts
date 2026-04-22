import type { RawJSONLines } from '@/claude/types'
import type { SDKAssistantMessage, SDKMessage } from './sdk'

type ClaudeStreamEventRecord = {
    message?: unknown
    delta?: unknown
}

function readNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readMessageId(value: unknown): string | null {
    const record = asRecord(value)
    return record ? readNonEmptyString(record.id) : null
}

function getStreamEventRecord(message: SDKMessage): ClaudeStreamEventRecord | null {
    if (message.type !== 'stream_event') {
        return null
    }

    const record = asRecord((message as { event?: unknown }).event)
    return record ? record : null
}

export function extractClaudeAssistantTurnIdFromSdkMessage(message: SDKMessage): string | null {
    if (message.type === 'assistant') {
        const assistantMessage = message as SDKAssistantMessage & { message: { id?: unknown } }
        return (
            readNonEmptyString(assistantMessage.message.id) ??
            readNonEmptyString((message as { requestId?: unknown }).requestId)
        )
    }

    const streamEvent = getStreamEventRecord(message)
    return streamEvent ? readMessageId(streamEvent.message) : null
}

export function extractClaudeTextDelta(message: SDKMessage): string | null {
    const streamEvent = getStreamEventRecord(message)
    if (!streamEvent) {
        return null
    }

    const delta = asRecord(streamEvent.delta)
    if (!delta || delta.type !== 'text_delta') {
        return null
    }

    return readNonEmptyString(delta.text)
}

export function extractClaudeAssistantTurnIdFromLogMessage(message: RawJSONLines): string | null {
    if (message.type !== 'assistant' || !message.message) {
        return null
    }

    const messageId = readMessageId(message.message)
    return messageId ?? readNonEmptyString((message as { requestId?: unknown }).requestId)
}
