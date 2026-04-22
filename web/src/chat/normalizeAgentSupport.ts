import {
    asNumber,
    asString,
    extractProposedPlanSegments,
    isObject,
    isSystemInjectedPseudoUserText,
} from '@viby/protocol'
import type { AgentEvent, NormalizedAgentContent, NormalizedMessage, ToolResultPermission } from '@/chat/types'

const PROPOSED_PLAN_TOOL_NAME = 'proposed_plan'

export function normalizeToolResultPermissions(value: unknown): ToolResultPermission | undefined {
    if (!isObject(value)) {
        return undefined
    }

    const date = asNumber(value.date)
    const result = value.result
    if (date === null || (result !== 'approved' && result !== 'denied')) {
        return undefined
    }

    const allowedTools = Array.isArray(value.allowedTools)
        ? value.allowedTools.filter((tool) => typeof tool === 'string')
        : undefined
    const decision = value.decision
    const normalizedDecision =
        decision === 'approved' || decision === 'approved_for_session' || decision === 'denied' || decision === 'abort'
            ? decision
            : undefined

    return {
        date,
        result,
        mode: asString(value.mode) ?? undefined,
        allowedTools,
        decision: normalizedDecision,
    }
}

export function normalizeAgentEvent(value: unknown): AgentEvent | null {
    if (!isObject(value) || typeof value.type !== 'string') {
        return null
    }

    return value as AgentEvent
}

export function normalizeAssistantOutput(
    messageId: string,
    localId: string | null,
    createdAt: number,
    data: Record<string, unknown>,
    meta?: unknown
): NormalizedMessage | null {
    const uuid = asString(data.uuid) ?? messageId
    const parentUUID = asString(data.parentUuid) ?? null
    const isSidechain = Boolean(data.isSidechain)
    const message = isObject(data.message) ? data.message : null
    if (!message) {
        return null
    }

    const blocks: NormalizedAgentContent[] = []
    const modelContent = message.content
    let proposedPlanIndex = 0

    if (typeof modelContent === 'string') {
        proposedPlanIndex = appendAssistantTextBlocks(blocks, modelContent, uuid, parentUUID, proposedPlanIndex)
    } else if (Array.isArray(modelContent)) {
        for (const block of modelContent) {
            if (!isObject(block) || typeof block.type !== 'string') {
                continue
            }

            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
                proposedPlanIndex = appendAssistantTextBlocks(blocks, block.text, uuid, parentUUID, proposedPlanIndex)
                continue
            }

            if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim().length > 0) {
                blocks.push({ type: 'reasoning', text: block.thinking, uuid, parentUUID })
                continue
            }

            if ((block.type === 'tool_use' || block.type === 'toolCall') && typeof block.id === 'string') {
                const toolBlock = block as Record<string, unknown>
                const input =
                    'input' in toolBlock ? toolBlock.input : 'arguments' in toolBlock ? toolBlock.arguments : undefined
                const description = isObject(input) && typeof input.description === 'string' ? input.description : null

                blocks.push({
                    type: 'tool-call',
                    id: block.id,
                    name: asString(toolBlock.name) ?? 'Tool',
                    input,
                    description,
                    uuid,
                    parentUUID,
                })
            }
        }
    }

    if (blocks.length === 0) {
        return null
    }

    const usage = isObject(message.usage) ? (message.usage as Record<string, unknown>) : null
    const inputTokens = usage ? (asNumber(usage.input_tokens) ?? asNumber(usage.input)) : null
    const outputTokens = usage ? (asNumber(usage.output_tokens) ?? asNumber(usage.output)) : null

    return {
        id: messageId,
        localId,
        createdAt,
        role: 'agent',
        isSidechain,
        content: blocks,
        meta,
        usage:
            inputTokens !== null && outputTokens !== null
                ? {
                      input_tokens: inputTokens,
                      output_tokens: outputTokens,
                      cache_creation_input_tokens: asNumber(usage?.cache_creation_input_tokens) ?? undefined,
                      cache_read_input_tokens: asNumber(usage?.cache_read_input_tokens) ?? undefined,
                      service_tier: asString(usage?.service_tier) ?? undefined,
                  }
                : undefined,
    }
}

export function appendAssistantTextBlocks(
    blocks: NormalizedAgentContent[],
    text: string,
    uuid: string,
    parentUUID: string | null,
    proposedPlanIndex = 0
): number {
    const segments = extractProposedPlanSegments(text)
    let nextProposedPlanIndex = proposedPlanIndex

    for (const segment of segments) {
        if (segment.kind === 'text') {
            if (segment.text.trim().length > 0) {
                blocks.push({ type: 'text', text: segment.text, uuid, parentUUID })
            }
            continue
        }

        const callId = `${uuid}:proposed-plan:${nextProposedPlanIndex}`
        nextProposedPlanIndex += 1
        const payload = { plan: segment.markdown }
        blocks.push({
            type: 'tool-call',
            id: callId,
            name: PROPOSED_PLAN_TOOL_NAME,
            input: payload,
            description: null,
            uuid: callId,
            parentUUID,
        })
        blocks.push({
            type: 'tool-result',
            tool_use_id: callId,
            content: payload,
            is_error: false,
            uuid: `${callId}:result`,
            parentUUID: callId,
        })
    }

    return nextProposedPlanIndex
}

export function normalizeUserOutput(
    messageId: string,
    localId: string | null,
    createdAt: number,
    data: Record<string, unknown>,
    meta?: unknown
): NormalizedMessage | null {
    const uuid = asString(data.uuid) ?? messageId
    const parentUUID = asString(data.parentUuid) ?? null
    const isSidechain = Boolean(data.isSidechain)
    const message = isObject(data.message) ? data.message : null
    if (!message) {
        return null
    }

    const messageContent = message.content
    if (isSystemInjectedPseudoUserText(messageContent)) {
        return null
    }

    if (isSidechain && typeof messageContent === 'string') {
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'agent',
            isSidechain: true,
            content: [{ type: 'sidechain', uuid, prompt: messageContent }],
        }
    }

    if (typeof messageContent === 'string') {
        return {
            id: messageId,
            localId,
            createdAt,
            role: 'user',
            isSidechain: false,
            content: { type: 'text', text: messageContent },
            meta,
        }
    }

    const blocks: NormalizedAgentContent[] = []
    if (Array.isArray(messageContent)) {
        for (const block of messageContent) {
            if (!isObject(block) || typeof block.type !== 'string') {
                continue
            }

            if (block.type === 'text' && typeof block.text === 'string') {
                blocks.push({ type: 'text', text: block.text, uuid, parentUUID })
                continue
            }

            if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
                const rawContent = 'content' in block ? (block as Record<string, unknown>).content : undefined
                const embeddedToolUseResult =
                    'toolUseResult' in data ? (data as Record<string, unknown>).toolUseResult : null

                blocks.push({
                    type: 'tool-result',
                    tool_use_id: block.tool_use_id,
                    content: embeddedToolUseResult ?? rawContent,
                    is_error: Boolean(block.is_error),
                    uuid,
                    parentUUID,
                    permissions: normalizeToolResultPermissions(block.permissions),
                })
            }
        }
    }

    return {
        id: messageId,
        localId,
        createdAt,
        role: 'agent',
        isSidechain,
        content: blocks,
        meta,
    }
}
