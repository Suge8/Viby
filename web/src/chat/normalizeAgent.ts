import { isObject } from '@viby/protocol'
import { normalizeCodexRecord } from '@/chat/normalizeAgentCodex'
import { isCodexContent, isSkippableAgentContent, normalizeOutputRecord } from '@/chat/normalizeAgentOutput'
import type { NormalizedMessage } from '@/chat/types'

export { isCodexContent, isSkippableAgentContent }

export function normalizeAgentRecord(
    messageId: string,
    localId: string | null,
    createdAt: number,
    content: unknown,
    meta?: unknown
): NormalizedMessage | null {
    if (!isObject(content) || typeof content.type !== 'string') {
        return null
    }

    if (content.type === 'output') {
        return normalizeOutputRecord(messageId, localId, createdAt, content, meta)
    }

    if (content.type === 'event') {
        return normalizeOutputRecord(messageId, localId, createdAt, content, meta)
    }

    if (content.type === 'codex') {
        return normalizeCodexRecord(messageId, localId, createdAt, content, meta)
    }

    return null
}
