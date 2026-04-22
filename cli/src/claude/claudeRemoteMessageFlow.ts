import type { ClaudePermissionMode } from '@viby/protocol/types'
import { AssistantStreamBridge } from '@/agent/assistantStreamBridge'
import { logger } from '@/ui/logger'
import {
    extractClaudeAssistantTurnIdFromLogMessage,
    extractClaudeAssistantTurnIdFromSdkMessage,
    extractClaudeTextDelta,
} from './claudeStreamSupport'
import type { SDKAssistantMessage, SDKMessage, SDKUserMessage } from './sdk'
import { PLAN_FAKE_REJECT } from './sdk/prompts'
import type { RawJSONLines } from './types'
import type { OutgoingMessageQueue } from './utils/OutgoingMessageQueue'
import type { PermissionHandler } from './utils/permissionHandler'
import type { SDKToLogConverter } from './utils/sdkToLogConverter'

interface PermissionsField {
    date: number
    result: 'approved' | 'denied'
    mode?: ClaudePermissionMode
    allowedTools?: string[]
}

type RawUserToolResultLogMessage = Extract<RawJSONLines, { type: 'user' }> & {
    message: { content: Array<Record<string, unknown>> }
}

const TOOL_RESULT_DELAY_MS = 250

function getTaskToolPrompt(value: unknown): string | null {
    const prompt = value && typeof value === 'object' ? (value as { prompt?: unknown }).prompt : null
    return typeof prompt === 'string' ? prompt : null
}

export class ClaudeRemoteMessageFlow {
    private readonly planModeToolCalls = new Set<string>()
    private readonly ongoingToolCalls = new Map<string, { parentToolCallId: string | null }>()
    private readonly assistantStream: AssistantStreamBridge

    constructor(
        private readonly permissionHandler: PermissionHandler,
        private readonly messageQueue: OutgoingMessageQueue,
        private readonly sdkToLogConverter: SDKToLogConverter,
        private readonly sendLogMessage: (logMessage: RawJSONLines) => void,
        appendAssistantStream: (assistantTurnId: string, delta: string) => void,
        clearAssistantStream: (assistantTurnId?: string) => void
    ) {
        this.assistantStream = new AssistantStreamBridge({
            append: ({ assistantTurnId, delta }) => appendAssistantStream(assistantTurnId, delta),
            clear: ({ assistantTurnId }) => clearAssistantStream(assistantTurnId),
        })
    }

    handle(message: SDKMessage): void {
        this.handleAssistantStream(message)
        this.permissionHandler.onMessage(message)
        this.trackPlanModeToolCalls(message)
        this.trackOngoingToolCalls(message)
        this.releaseCompletedToolCalls(message)

        const logMessage = this.sdkToLogConverter.convert(this.normalizePlanModeMessage(message))
        if (logMessage) {
            this.enqueueLogMessage(message, logMessage)
        }

        this.enqueueTaskSidechainPrompt(message)
    }

    flushDanglingAssistantStream(): void {
        this.assistantStream.clearDanglingAssistantTurn()
    }

    flushInterruptedToolCalls(): void {
        for (const [toolCallId, { parentToolCallId }] of this.ongoingToolCalls) {
            const converted = this.sdkToLogConverter.generateInterruptedToolResult(toolCallId, parentToolCallId)
            if (converted) {
                logger.debug('[remote]: terminating tool call ' + toolCallId + ' parent: ' + parentToolCallId)
                this.sendLogMessage(converted)
            }
        }

        this.ongoingToolCalls.clear()
    }

    private handleAssistantStream(message: SDKMessage): void {
        const assistantTurnId = extractClaudeAssistantTurnIdFromSdkMessage(message)
        if (assistantTurnId) {
            this.assistantStream.beginAssistantTurn(assistantTurnId)
        }
        const delta = extractClaudeTextDelta(message)
        if (!delta) return
        this.assistantStream.appendTextDelta(delta)
    }

    private trackPlanModeToolCalls(message: SDKMessage): void {
        if (!isAssistantMessage(message)) {
            return
        }

        for (const content of message.message.content) {
            if (content.type === 'tool_use' && (content.name === 'exit_plan_mode' || content.name === 'ExitPlanMode')) {
                logger.debug('[remote]: detected plan mode tool call ' + content.id!)
                this.planModeToolCalls.add(content.id! as string)
            }
        }
    }

    private trackOngoingToolCalls(message: SDKMessage): void {
        if (!isAssistantMessage(message)) {
            return
        }

        for (const content of message.message.content) {
            if (content.type === 'tool_use') {
                logger.debug(
                    '[remote]: detected tool use ' + content.id! + ' parent: ' + (message.parent_tool_use_id ?? null)
                )
                this.ongoingToolCalls.set(content.id!, { parentToolCallId: message.parent_tool_use_id ?? null })
            }
        }
    }

    private releaseCompletedToolCalls(message: SDKMessage): void {
        if (!isUserMessage(message)) {
            return
        }

        const contentBlocks = getUserContentBlocks(message)
        if (!contentBlocks) {
            return
        }

        for (const content of contentBlocks) {
            if (content.type === 'tool_result' && content.tool_use_id) {
                this.ongoingToolCalls.delete(content.tool_use_id)
                this.messageQueue.releaseToolCall(content.tool_use_id)
            }
        }
    }

    private normalizePlanModeMessage(message: SDKMessage): SDKMessage {
        if (!isUserMessage(message)) {
            return message
        }

        const contentBlocks = getUserContentBlocks(message)
        if (!contentBlocks) {
            return message
        }

        return {
            ...message,
            message: {
                ...message.message,
                content: contentBlocks.map((content) => {
                    if (
                        content.type === 'tool_result' &&
                        content.tool_use_id &&
                        this.planModeToolCalls.has(content.tool_use_id) &&
                        content.content === PLAN_FAKE_REJECT
                    ) {
                        logger.debug('[remote]: hack plan mode exit')
                        logger.debugLargeJson('[remote]: hack plan mode exit', content)
                        return {
                            ...content,
                            is_error: false,
                            content: 'Plan approved',
                            mode: content.mode,
                        }
                    }

                    return content
                }),
            },
        }
    }

    private enqueueLogMessage(message: SDKMessage, logMessage: RawJSONLines): void {
        this.attachPermissionsToToolResults(message, logMessage)
        this.resolveAssistantStreamWithDurableMessage(logMessage)

        if (isAssistantMessage(message)) {
            const toolCallIds = this.extractToolCallIds(message)
            if (toolCallIds.length > 0 && message.parent_tool_use_id === undefined) {
                this.messageQueue.enqueue(logMessage, {
                    delay: TOOL_RESULT_DELAY_MS,
                    toolCallIds,
                })
                return
            }
        }

        this.messageQueue.enqueue(logMessage)
    }

    private resolveAssistantStreamWithDurableMessage(logMessage: RawJSONLines): void {
        this.assistantStream.acknowledgeDurableTurn(extractClaudeAssistantTurnIdFromLogMessage(logMessage))
    }

    private attachPermissionsToToolResults(message: SDKMessage, logMessage: RawJSONLines): void {
        if (!isUserMessage(message) || !this.isUserLogMessage(logMessage)) {
            return
        }

        for (let index = 0; index < logMessage.message.content.length; index += 1) {
            const content = logMessage.message.content[index]
            const toolUseId = typeof content.tool_use_id === 'string' ? content.tool_use_id : null
            if (content.type !== 'tool_result' || !toolUseId) {
                continue
            }

            const response = this.permissionHandler.getResponses().get(toolUseId)
            if (!response) {
                continue
            }

            const permissions: PermissionsField = {
                date: response.receivedAt || Date.now(),
                result: response.approved ? 'approved' : 'denied',
            }

            if (response.mode) {
                permissions.mode = response.mode
            }

            if (response.allowTools && response.allowTools.length > 0) {
                permissions.allowedTools = response.allowTools
            }

            logMessage.message.content[index] = {
                ...content,
                permissions,
            }
        }
    }

    private enqueueTaskSidechainPrompt(message: SDKMessage): void {
        if (!isAssistantMessage(message)) {
            return
        }

        for (const content of message.message.content) {
            const taskPrompt = getTaskToolPrompt(content.input)
            if (
                content.type === 'tool_use' &&
                typeof content.id === 'string' &&
                content.name === 'Task' &&
                taskPrompt
            ) {
                const sidechainLogMessage = this.sdkToLogConverter.convertSidechainUserMessage(content.id, taskPrompt)
                if (sidechainLogMessage) {
                    this.messageQueue.enqueue(sidechainLogMessage)
                }
            }
        }
    }

    private extractToolCallIds(message: SDKAssistantMessage): string[] {
        return message.message.content
            .filter(
                (content): content is (typeof message.message.content)[number] & { type: 'tool_use'; id: string } => {
                    return content.type === 'tool_use' && typeof content.id === 'string'
                }
            )
            .map((content) => content.id)
    }

    private isUserLogMessage(value: RawJSONLines): value is RawUserToolResultLogMessage {
        return Boolean(
            value &&
                typeof value === 'object' &&
                value.type === 'user' &&
                Array.isArray((value as { message?: { content?: unknown } }).message?.content)
        )
    }
}

function isAssistantMessage(message: SDKMessage): message is SDKAssistantMessage {
    const candidate = message as unknown as { message?: { content?: unknown } }
    return (
        message.type === 'assistant' &&
        typeof candidate.message === 'object' &&
        candidate.message !== null &&
        Array.isArray(candidate.message.content)
    )
}

function isUserMessage(message: SDKMessage): message is SDKUserMessage {
    const candidate = message as unknown as { message?: { content?: unknown } }
    return (
        message.type === 'user' &&
        typeof candidate.message === 'object' &&
        candidate.message !== null &&
        (typeof candidate.message.content === 'string' || Array.isArray(candidate.message.content))
    )
}

function getUserContentBlocks(
    message: SDKUserMessage
): Array<Extract<SDKUserMessage['message']['content'], unknown[]>[number]> | null {
    return Array.isArray(message.message.content) ? message.message.content : null
}
