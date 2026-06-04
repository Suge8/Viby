import { asString, isObject } from '@viby/protocol'
import type { PermissionRequest } from '@/agent/types'

export function buildAcpPermissionRequest(params: unknown, activeSessionId: string | null): PermissionRequest | null {
    if (!isObject(params)) {
        return null
    }

    const sessionId = asString(params.sessionId) ?? activeSessionId ?? 'unknown'
    const toolCall = isObject(params.toolCall) ? params.toolCall : {}
    const toolCallId = asString(toolCall.toolCallId) ?? `tool-${Date.now()}`

    return {
        id: toolCallId,
        sessionId,
        toolCallId,
        title: asString(toolCall.title) ?? undefined,
        kind: asString(toolCall.kind) ?? undefined,
        rawInput: 'rawInput' in toolCall ? toolCall.rawInput : undefined,
        rawOutput: 'rawOutput' in toolCall ? toolCall.rawOutput : undefined,
        options: Array.isArray(params.options)
            ? params.options
                  .filter((option) => isObject(option))
                  .map((option, index) => ({
                      optionId: asString(option.optionId) ?? `option-${index + 1}`,
                      name: asString(option.name) ?? `Option ${index + 1}`,
                      kind: asString(option.kind) ?? 'allow_once',
                  }))
            : [],
    }
}
