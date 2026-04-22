import { asNumber, asString, isObject } from '@viby/protocol'
import { normalizeAgentEvent, normalizeAssistantOutput, normalizeUserOutput } from '@/chat/normalizeAgentSupport'
import type { NormalizedMessage } from '@/chat/types'

export function isSkippableAgentContent(content: unknown): boolean {
    if (!isObject(content) || content.type !== 'output') {
        return false
    }

    const data = isObject(content.data) ? content.data : null
    return Boolean(data?.isMeta) || Boolean(data?.isCompactSummary)
}

export function isCodexContent(content: unknown): boolean {
    return isObject(content) && content.type === 'codex'
}

export function normalizeOutputRecord(
    messageId: string,
    localId: string | null,
    createdAt: number,
    content: Record<string, unknown>,
    meta?: unknown
): NormalizedMessage | null {
    if (content.type === 'event') {
        const event = normalizeAgentEvent(content.data)
        return event
            ? {
                  id: messageId,
                  localId,
                  createdAt,
                  role: 'event',
                  content: event,
                  isSidechain: false,
                  meta,
              }
            : null
    }

    const data = isObject(content.data) ? content.data : null
    if (!data || typeof data.type !== 'string' || data.isMeta || data.isCompactSummary) {
        return null
    }

    if (data.type === 'assistant') {
        return normalizeAssistantOutput(messageId, localId, createdAt, data, meta)
    }

    if (data.type === 'user') {
        return normalizeUserOutput(messageId, localId, createdAt, data, meta)
    }

    if (data.type === 'summary' && typeof data.summary === 'string') {
        return null
    }

    if (data.type === 'system' && data.subtype === 'api_error') {
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'event',
            content: {
                type: 'api-error',
                retryAttempt: asNumber(data.retryAttempt) ?? 0,
                maxRetries: asNumber(data.maxRetries) ?? 0,
                error: data.error,
            },
            isSidechain: false,
            meta,
        }
    }

    if (data.type === 'system' && data.subtype === 'turn_duration') {
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'event',
            content: {
                type: 'turn-duration',
                durationMs: asNumber(data.durationMs) ?? 0,
            },
            isSidechain: false,
            meta,
        }
    }

    if (data.type === 'system' && data.subtype === 'microcompact_boundary') {
        const metadata = isObject(data.microcompactMetadata) ? data.microcompactMetadata : null
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'event',
            content: {
                type: 'microcompact',
                trigger: asString(metadata?.trigger) ?? 'auto',
                preTokens: asNumber(metadata?.preTokens) ?? 0,
                tokensSaved: asNumber(metadata?.tokensSaved) ?? 0,
            },
            isSidechain: false,
            meta,
        }
    }

    if (data.type === 'system' && data.subtype === 'compact_boundary') {
        const metadata = isObject(data.compactMetadata) ? data.compactMetadata : null
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'event',
            content: {
                type: 'compact',
                trigger: asString(metadata?.trigger) ?? 'auto',
                preTokens: asNumber(metadata?.preTokens) ?? 0,
            },
            isSidechain: false,
            meta,
        }
    }

    return null
}
