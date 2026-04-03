import { buildPiAssistantStreamId, unwrapRoleWrappedRecordEnvelope } from '@viby/protocol/messages'
import type { CliSessionRecoveryResponse, SessionModelReasoningEffort } from '@/api/types'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'

export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

type PiTextContent = {
    type: 'text'
    text: string
}

type PiImageContent = {
    type: 'image'
    data: string
    mimeType: string
}

type PiThinkingContent = {
    type: 'thinking'
    thinking: string
    thinkingSignature?: string
    redacted?: boolean
}

type PiToolCall = {
    type: 'toolCall'
    id: string
    name: string
    arguments: Record<string, unknown>
    thoughtSignature?: string
}

type PiUsage = {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
    cost: {
        input: number
        output: number
        cacheRead: number
        cacheWrite: number
        total: number
    }
}

export type PiModelLike = {
    provider: string
    id: string
    reasoning?: boolean
}

export type PiUserMessage = {
    role: 'user'
    content: string | Array<PiTextContent | PiImageContent>
    timestamp: number
}

export type PiAssistantMessage = {
    role: 'assistant'
    content: Array<PiTextContent | PiThinkingContent | PiToolCall>
    api: string
    provider: string
    model: string
    responseId?: string
    usage: PiUsage
    stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
    errorMessage?: string
    timestamp: number
}

export type PiToolResultMessage = {
    role: 'toolResult'
    toolCallId: string
    toolName: string
    content: Array<PiTextContent | PiImageContent>
    details?: unknown
    isError: boolean
    timestamp: number
}

export type PiMessage = PiUserMessage | PiAssistantMessage | PiToolResultMessage

type PiTranscriptPayload = {
    type: 'assistant'
    message: PiAssistantMessage
} | {
    type: 'user'
    toolUseResult: PiToolResultMessage
}

export function formatPiModel(model: PiModelLike | null | undefined): string | null {
    if (!model) {
        return null
    }

    return `${model.provider}/${model.id}`
}

export function toPiThinkingLevel(
    value: SessionModelReasoningEffort | null | undefined
): PiThinkingLevel | undefined {
    if (value === undefined || value === null) {
        return undefined
    }

    if (value === 'max') {
        return undefined
    }

    return value === 'none' ? 'off' : value
}

export function fromPiThinkingLevel(level: PiThinkingLevel | null | undefined): SessionModelReasoningEffort | null {
    if (!level) {
        return null
    }

    return level === 'off' ? 'none' : level
}

export function clampPiThinkingLevel(
    requestedLevel: PiThinkingLevel,
    availableLevels: readonly PiThinkingLevel[]
): PiThinkingLevel {
    if (availableLevels.length === 0) {
        return 'off'
    }

    if (availableLevels.includes(requestedLevel)) {
        return requestedLevel
    }

    const orderedLevels: readonly PiThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']
    const availableSet = new Set(availableLevels)
    const requestedIndex = orderedLevels.indexOf(requestedLevel)

    for (let index = requestedIndex; index < orderedLevels.length; index += 1) {
        const candidate = orderedLevels[index]
        if (candidate && availableSet.has(candidate)) {
            return candidate
        }
    }

    for (let index = requestedIndex - 1; index >= 0; index -= 1) {
        const candidate = orderedLevels[index]
        if (candidate && availableSet.has(candidate)) {
            return candidate
        }
    }

    return availableLevels[0]
}

export function rehydratePiMessages(messages: CliSessionRecoveryResponse['messages']): PiMessage[] {
    const recovered: PiMessage[] = []

    for (const message of messages) {
        const record = unwrapRoleWrappedRecordEnvelope(message.content)
        if (!record) {
            continue
        }

        if (record.role === 'user' && isUserTextRecord(record.content)) {
            recovered.push({
                role: 'user',
                content: formatMessageWithAttachments(
                    record.content.text,
                    Array.isArray(record.content.attachments)
                        ? record.content.attachments as Parameters<typeof formatMessageWithAttachments>[1]
                        : undefined
                ),
                timestamp: message.createdAt
            })
            continue
        }

        if (record.role !== 'agent' || !isRecord(record.content)) {
            continue
        }

        const payload = readPiTranscriptPayload(record.content)
        if (!payload) {
            continue
        }

        if (payload.type === 'assistant') {
            recovered.push(payload.message)
        } else {
            recovered.push(payload.toolUseResult)
        }
    }

    return recovered
}

export function getPiAssistantStreamId(message: Pick<PiAssistantMessage, 'responseId' | 'timestamp'>): string {
    const streamId = buildPiAssistantStreamId(message.responseId, message.timestamp)
    if (!streamId) {
        throw new Error('Pi assistant message is missing a stable stream id')
    }

    return streamId
}

export function buildPiAssistantOutputRecord(message: PiAssistantMessage): Record<string, unknown> {
    return {
        type: 'assistant',
        uuid: getPiAssistantStreamId(message),
        parentUuid: null,
        isSidechain: false,
        message
    }
}

export function buildPiToolResultOutputRecord(result: PiToolResultMessage): Record<string, unknown> {
    return {
        type: 'user',
        uuid: `${result.toolCallId}-result-${result.timestamp}`,
        parentUuid: null,
        isSidechain: false,
        toolUseResult: result,
        message: {
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: result.toolCallId,
                    content: result.content,
                    is_error: result.isError
                }
            ]
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUserTextRecord(
    value: unknown
): value is { type: 'text'; text: string; attachments?: unknown } {
    return isRecord(value) && value.type === 'text' && typeof value.text === 'string'
}

function isPiAssistantMessage(value: unknown): value is PiAssistantMessage {
    return isRecord(value)
        && value.role === 'assistant'
        && Array.isArray(value.content)
        && typeof value.provider === 'string'
        && typeof value.model === 'string'
}

function isPiToolResultMessage(value: unknown): value is PiToolResultMessage {
    return isRecord(value)
        && value.role === 'toolResult'
        && typeof value.toolCallId === 'string'
        && typeof value.toolName === 'string'
        && Array.isArray(value.content)
        && typeof value.isError === 'boolean'
}

function readPiTranscriptPayload(content: Record<string, unknown>): PiTranscriptPayload | null {
    if (content.type !== 'output' && content.type !== 'codex') {
        return null
    }

    const data = isRecord(content.data) ? content.data : null
    if (!data || typeof data.type !== 'string') {
        return null
    }

    if (data.type === 'assistant' && isPiAssistantMessage(data.message)) {
        return {
            type: 'assistant',
            message: data.message
        }
    }

    if (data.type === 'user' && isPiToolResultMessage(data.toolUseResult)) {
        return {
            type: 'user',
            toolUseResult: data.toolUseResult
        }
    }

    return null
}
