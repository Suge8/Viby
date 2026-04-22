import { isObject } from '@viby/protocol'
import { deepEqual } from '@/utils/deepEqual'
import type { PermissionMode } from '../loop'
import { SDKAssistantMessage, SDKMessage, SDKUserMessage } from '../sdk'

export { isAllowedBashCommand, parseBashPermission } from '@/modules/common/permission/allowedToolSupport'

export interface PermissionResponse {
    id: string
    approved: boolean
    reason?: string
    mode?: PermissionMode
    allowTools?: string[]
    answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    receivedAt?: number
}

export type ToolCallRecord = { id: string; name: string; input: unknown; used: boolean }

export const PLAN_EXIT_MODES: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions']

export function isAskUserQuestionToolName(toolName: string): boolean {
    return toolName === 'AskUserQuestion' || toolName === 'ask_user_question'
}

export function isRequestUserInputToolName(toolName: string): boolean {
    return toolName === 'request_user_input'
}

export function isQuestionToolName(toolName: string): boolean {
    return isAskUserQuestionToolName(toolName) || isRequestUserInputToolName(toolName)
}

export function buildAskUserQuestionUpdatedInput(
    input: unknown,
    answers: Record<string, string[]> | Record<string, { answers: string[] }>
): Record<string, unknown> {
    const flatAnswers: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(answers)) {
        if (Array.isArray(value)) {
            flatAnswers[key] = value
            continue
        }
        if (value && typeof value === 'object' && 'answers' in value) {
            flatAnswers[key] = value.answers
        }
    }

    if (!isObject(input)) {
        return { answers: flatAnswers }
    }

    return {
        ...input,
        answers: flatAnswers,
    }
}

export function buildRequestUserInputUpdatedInput(input: unknown, answers: unknown): Record<string, unknown> {
    if (!isObject(input)) {
        return { answers }
    }

    return {
        ...input,
        answers,
    }
}

export function resolveToolCallId(toolCalls: ToolCallRecord[], name: string, args: unknown): string | null {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
        const call = toolCalls[i]
        if (call.name !== name || !deepEqual(call.input, args)) {
            continue
        }
        if (call.used) {
            return null
        }
        call.used = true
        return call.id
    }

    return null
}

export function trackToolCalls(toolCalls: ToolCallRecord[], message: SDKMessage): void {
    if (message.type === 'assistant') {
        const assistantMsg = message as SDKAssistantMessage
        if (assistantMsg.message?.content) {
            for (const block of assistantMsg.message.content) {
                if (block.type === 'tool_use') {
                    toolCalls.push({
                        id: block.id!,
                        name: block.name!,
                        input: block.input,
                        used: false,
                    })
                }
            }
        }
        return
    }

    if (message.type !== 'user') {
        return
    }

    const userMsg = message as SDKUserMessage
    if (!Array.isArray(userMsg.message?.content)) {
        return
    }

    for (const block of userMsg.message.content) {
        if (block.type !== 'tool_result' || !block.tool_use_id) {
            continue
        }
        const toolCall = toolCalls.find((candidate) => candidate.id === block.tool_use_id)
        if (toolCall && !toolCall.used) {
            toolCall.used = true
        }
    }
}

export function isToolCallAborted(
    toolCalls: readonly ToolCallRecord[],
    responses: ReadonlyMap<string, PermissionResponse>,
    toolCallId: string
): boolean {
    if (responses.get(toolCallId)?.approved === false) {
        return true
    }

    const toolCall = toolCalls.find((candidate) => candidate.id === toolCallId)
    return Boolean(toolCall && (toolCall.name === 'exit_plan_mode' || toolCall.name === 'ExitPlanMode'))
}
