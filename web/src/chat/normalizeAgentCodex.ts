import { asString, isObject } from '@viby/protocol'
import { appendAssistantTextBlocks, normalizeAssistantOutput, normalizeUserOutput } from '@/chat/normalizeAgentSupport'
import type { NormalizedMessage } from '@/chat/types'
import { extractPlanProgressItems } from '@/lib/planProgress'

export function normalizeCodexRecord(
    messageId: string,
    localId: string | null,
    createdAt: number,
    content: Record<string, unknown>,
    meta?: unknown
): NormalizedMessage | null {
    const data = isObject(content.data) ? content.data : null
    if (!data || typeof data.type !== 'string') {
        return null
    }

    if (data.type === 'message' && typeof data.message === 'string') {
        const contentBlocks: NormalizedMessage['content'] = []
        appendAssistantTextBlocks(contentBlocks, data.message, messageId, null)
        if (contentBlocks.length === 0) {
            return null
        }

        return {
            id: messageId,
            localId,
            createdAt,
            role: 'agent',
            isSidechain: false,
            content: contentBlocks,
            meta,
        }
    }

    if (data.type === 'reasoning' && typeof data.message === 'string') {
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'agent',
            isSidechain: false,
            content: [{ type: 'reasoning', text: data.message, uuid: messageId, parentUUID: null }],
            meta,
        }
    }

    if (data.type === 'tool-call' && typeof data.callId === 'string') {
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'agent',
            isSidechain: false,
            content: [
                {
                    type: 'tool-call',
                    id: data.callId,
                    name: asString(data.name) ?? 'unknown',
                    input: data.input,
                    description: null,
                    uuid: asString(data.id) ?? messageId,
                    parentUUID: null,
                },
            ],
            meta,
        }
    }

    if (data.type === 'tool-call-result' && typeof data.callId === 'string') {
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'agent',
            isSidechain: false,
            content: [
                {
                    type: 'tool-result',
                    tool_use_id: data.callId,
                    content: data.output,
                    is_error: false,
                    uuid: asString(data.id) ?? messageId,
                    parentUUID: null,
                },
            ],
            meta,
        }
    }

    if (data.type === 'plan') {
        const plan = extractPlanProgressItems(data.entries)
        if (plan.length === 0) {
            return null
        }
        const callId = asString(data.id) ?? `${messageId}:plan`
        const input = {
            plan,
            ...(typeof data.explanation === 'string' ? { explanation: data.explanation } : {}),
        }
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'agent',
            isSidechain: false,
            content: [
                {
                    type: 'tool-call',
                    id: callId,
                    name: 'update_plan',
                    input,
                    description: null,
                    uuid: callId,
                    parentUUID: null,
                },
                {
                    type: 'tool-result',
                    tool_use_id: callId,
                    content: input,
                    is_error: false,
                    uuid: `${callId}:result`,
                    parentUUID: callId,
                },
            ],
            meta,
        }
    }

    if (data.type === 'assistant') {
        return normalizeAssistantOutput(messageId, localId, createdAt, data, meta)
    }

    if (data.type === 'user') {
        return normalizeUserOutput(messageId, localId, createdAt, data, meta)
    }

    return null
}
