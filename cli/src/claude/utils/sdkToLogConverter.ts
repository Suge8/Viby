/**
 * Converter from SDK message types to log format (RawJSONLines)
 * Transforms Claude SDK messages into the format expected by session logs.
 */

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ClaudePermissionMode } from '@viby/protocol/types'
import type { SDKAssistantMessage, SDKMessage, SDKSystemMessage, SDKUserMessage } from '@/claude/sdk'
import type { RawJSONLines } from '@/claude/types'

export interface ConversionContext {
    sessionId: string
    cwd: string
    version?: string
    gitBranch?: string
    parentUuid?: string | null
}

type PermissionResponse = {
    approved: boolean
    mode?: ClaudePermissionMode
    reason?: string
}

type ConversionFields = {
    parentUuid: string | null
    isSidechain: boolean
    userType: 'external'
    cwd: string
    sessionId: string
    version: string
    gitBranch?: string
    uuid: string
    timestamp: string
}

type RawUserLogMessage = Extract<RawJSONLines, { type: 'user' }>
type ToolResultSDKMessage = SDKMessage & {
    type: 'tool_result'
    parent_tool_use_id?: string
    tool_use_id?: string
    content?: unknown
}

function getGitBranch(cwd: string): string | undefined {
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
        return branch || undefined
    } catch {
        return undefined
    }
}

function getParentToolUseId(message: SDKMessage): string | null {
    const parentToolUseId = (message as { parent_tool_use_id?: unknown }).parent_tool_use_id
    return typeof parentToolUseId === 'string' ? parentToolUseId : null
}

function getAssistantRequestId(message: SDKAssistantMessage): string | undefined {
    const requestId = (message as { requestId?: unknown }).requestId
    return typeof requestId === 'string' ? requestId : undefined
}

export class SDKToLogConverter {
    private lastUuid: string | null = null
    private readonly responses?: Map<string, PermissionResponse>
    private readonly sidechainLastUUID = new Map<string, string>()
    private readonly context: ConversionContext

    constructor(context: Omit<ConversionContext, 'parentUuid'>, responses?: Map<string, PermissionResponse>) {
        this.context = {
            ...context,
            gitBranch: context.gitBranch ?? getGitBranch(context.cwd),
            version: context.version ?? process.env.npm_package_version ?? '0.0.0',
            parentUuid: null,
        }
        this.responses = responses
    }

    updateSessionId(sessionId: string): void {
        this.context.sessionId = sessionId
    }

    resetParentChain(): void {
        this.lastUuid = null
        this.context.parentUuid = null
    }

    convert(sdkMessage: SDKMessage): RawJSONLines | null {
        const { baseFields, parentToolUseId, uuid } = this.createBaseFields(sdkMessage)
        const logMessage = this.convertByType(sdkMessage, baseFields)
        if (logMessage) {
            this.lastUuid = uuid
            if (parentToolUseId) {
                this.sidechainLastUUID.set(parentToolUseId, uuid)
            }
        }
        return logMessage
    }

    convertMany(sdkMessages: SDKMessage[]): RawJSONLines[] {
        return sdkMessages
            .map((message) => this.convert(message))
            .filter((message): message is RawJSONLines => message !== null)
    }

    convertSidechainUserMessage(toolUseId: string, content: string): RawJSONLines {
        const uuid = randomUUID()
        const timestamp = new Date().toISOString()
        this.sidechainLastUUID.set(toolUseId, uuid)
        return {
            ...this.sharedMessageFields(uuid, timestamp),
            parentUuid: null,
            isSidechain: true,
            type: 'user',
            message: {
                role: 'user',
                content,
            },
        }
    }

    generateInterruptedToolResult(toolUseId: string, parentToolUseId?: string | null): RawJSONLines {
        const uuid = randomUUID()
        const timestamp = new Date().toISOString()
        const errorMessage = '[Request interrupted by user for tool use]'
        const isSidechain = Boolean(parentToolUseId)
        const parentUuid = parentToolUseId ? (this.sidechainLastUUID.get(parentToolUseId) ?? null) : this.lastUuid
        if (parentToolUseId) {
            this.sidechainLastUUID.set(parentToolUseId, uuid)
        }

        const logMessage: RawJSONLines = {
            ...this.sharedMessageFields(uuid, timestamp),
            parentUuid,
            isSidechain,
            type: 'user',
            message: {
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        content: errorMessage,
                        is_error: true,
                        tool_use_id: toolUseId,
                    },
                ],
            },
            toolUseResult: `Error: ${errorMessage}`,
        }

        this.lastUuid = uuid
        return logMessage
    }

    private createBaseFields(sdkMessage: SDKMessage): {
        baseFields: ConversionFields
        parentToolUseId: string | null
        uuid: string
    } {
        const uuid = randomUUID()
        const timestamp = new Date().toISOString()
        const parentToolUseId = getParentToolUseId(sdkMessage)
        return {
            parentToolUseId,
            uuid,
            baseFields: {
                ...this.sharedMessageFields(uuid, timestamp),
                parentUuid: parentToolUseId ? (this.sidechainLastUUID.get(parentToolUseId) ?? null) : this.lastUuid,
                isSidechain: Boolean(parentToolUseId),
            },
        }
    }

    private sharedMessageFields(uuid: string, timestamp: string) {
        return {
            userType: 'external' as const,
            cwd: this.context.cwd,
            sessionId: this.context.sessionId,
            version: this.context.version ?? '0.0.0',
            gitBranch: this.context.gitBranch,
            uuid,
            timestamp,
        }
    }

    private convertByType(sdkMessage: SDKMessage, baseFields: ConversionFields): RawJSONLines | null {
        switch (sdkMessage.type) {
            case 'user':
                return this.convertUserMessage(sdkMessage as SDKUserMessage, baseFields)
            case 'assistant':
                return this.convertAssistantMessage(sdkMessage as SDKAssistantMessage, baseFields)
            case 'system':
                return this.convertSystemMessage(sdkMessage as SDKSystemMessage, baseFields)
            case 'tool_result':
                return this.convertToolResultMessage(sdkMessage as ToolResultSDKMessage, baseFields)
            case 'result':
                return null
            default:
                return null
        }
    }

    private convertUserMessage(sdkMessage: SDKUserMessage, baseFields: ConversionFields): RawJSONLines {
        const logMessage: RawUserLogMessage = {
            ...baseFields,
            type: 'user',
            message: sdkMessage.message,
        }

        if (Array.isArray(sdkMessage.message.content)) {
            for (const content of sdkMessage.message.content) {
                if (content.type !== 'tool_result' || !content.tool_use_id) {
                    continue
                }
                const mode = this.responses?.get(content.tool_use_id)?.mode
                if (mode) {
                    logMessage.mode = mode
                    break
                }
            }
        }

        return logMessage
    }

    private convertAssistantMessage(sdkMessage: SDKAssistantMessage, baseFields: ConversionFields): RawJSONLines {
        return {
            ...baseFields,
            type: 'assistant',
            message: sdkMessage.message,
            requestId: getAssistantRequestId(sdkMessage),
        }
    }

    private convertSystemMessage(sdkMessage: SDKSystemMessage, baseFields: ConversionFields): RawJSONLines {
        if (sdkMessage.subtype === 'init' && sdkMessage.session_id) {
            this.updateSessionId(sdkMessage.session_id)
        }

        return {
            ...baseFields,
            ...sdkMessage,
            type: 'system',
            subtype: sdkMessage.subtype,
            model: sdkMessage.model,
            tools: sdkMessage.tools,
        }
    }

    private convertToolResultMessage(sdkMessage: ToolResultSDKMessage, baseFields: ConversionFields): RawJSONLines {
        const logMessage: RawUserLogMessage = {
            ...baseFields,
            type: 'user',
            message: {
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: sdkMessage.tool_use_id,
                        content: sdkMessage.content,
                    },
                ],
            },
            toolUseResult: sdkMessage.content,
        }

        const mode = sdkMessage.tool_use_id ? this.responses?.get(sdkMessage.tool_use_id)?.mode : undefined
        if (mode) {
            logMessage.mode = mode
        }

        return logMessage
    }
}

export function convertSDKToLog(
    sdkMessage: SDKMessage,
    context: Omit<ConversionContext, 'parentUuid'>,
    responses?: Map<string, PermissionResponse>
): RawJSONLines | null {
    return new SDKToLogConverter(context, responses).convert(sdkMessage)
}
