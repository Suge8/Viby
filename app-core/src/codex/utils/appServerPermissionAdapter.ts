import { randomUUID } from 'node:crypto'
import { logger } from '@/ui/logger'
import type { CodexAppServerClient } from '../codexAppServerClient'
import type { CodexPermissionHandler } from './permissionHandler'

type PermissionDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort'

type PermissionResult = {
    decision: PermissionDecision
    reason?: string
}

type UserInputAnswers = Record<string, string[]> | Record<string, { answers: string[] }>
type RegisteredApprovalRequest = {
    itemId: string
    reason?: string
    input: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function mapDecision(decision: PermissionDecision): { decision: string } {
    switch (decision) {
        case 'approved':
            return { decision: 'accept' }
        case 'approved_for_session':
            return { decision: 'acceptForSession' }
        case 'denied':
            return { decision: 'decline' }
        case 'abort':
            return { decision: 'cancel' }
    }
}

function mapElicitationDecision(decision: PermissionDecision): { action: 'accept' | 'decline' | 'cancel' } {
    switch (decision) {
        case 'approved':
        case 'approved_for_session':
            return { action: 'accept' }
        case 'denied':
            return { action: 'decline' }
        case 'abort':
            return { action: 'cancel' }
    }
}

function asToolName(value: unknown): string | undefined {
    const toolName = asString(value)
    return toolName && toolName.trim().length > 0 ? toolName.trim() : undefined
}

function extractToolNameFromApprovalMessage(message: string | undefined): string | undefined {
    if (!message) {
        return undefined
    }

    const match = message.match(/tool "([^"]+)"/i)
    return match?.[1]?.trim() || undefined
}

function buildScopedToolName(serverName: string | undefined, toolName: string | undefined): string | undefined {
    if (!toolName) {
        return undefined
    }
    return serverName ? `mcp__${serverName}__${toolName}` : toolName
}

function extractMcpToolPermissionRequest(params: unknown): {
    toolCallId: string
    toolName: string
    input: unknown
} | null {
    const record = asRecord(params)
    if (!record) {
        return null
    }

    const meta = asRecord(record._meta) ?? {}
    const nested =
        asRecord(record.toolCall) ??
        asRecord(record.toolInvocation) ??
        asRecord(record.request) ??
        asRecord(record.item)
    const source = nested ?? record

    const serverName =
        asString(source.serverName) ?? asString(source.server) ?? asString(record.serverName) ?? asString(record.server)
    const toolName = buildScopedToolName(
        serverName,
        asToolName(source.toolName) ??
            asToolName(source.tool) ??
            asToolName(source.name) ??
            asToolName(record.toolName) ??
            asToolName(record.tool) ??
            asToolName(record.name) ??
            extractToolNameFromApprovalMessage(asString(record.message))
    )

    if (!toolName) {
        return null
    }

    const threadId = asString(record.threadId)
    const turnId = asString(record.turnId)

    return {
        toolCallId:
            asString(source.toolCallId) ??
            asString(source.callId) ??
            asString(source.itemId) ??
            asString(record.toolCallId) ??
            asString(record.callId) ??
            asString(record.itemId) ??
            (threadId && turnId ? `${threadId}:${turnId}:${toolName}` : undefined) ??
            randomUUID(),
        toolName,
        input:
            meta.tool_params ??
            source.arguments ??
            source.input ??
            source.params ??
            record.arguments ??
            record.input ??
            record.params ??
            {},
    }
}

function extractUserInputRequestId(params: unknown): string {
    const record = asRecord(params) ?? {}
    const threadId = asString(record.threadId)
    const turnId = asString(record.turnId)

    return (
        asString(record.itemId) ??
        asString(record.requestId) ??
        asString(record.toolCallId) ??
        asString(record.callId) ??
        asString(record.id) ??
        (threadId && turnId ? `${threadId}:${turnId}:request_user_input` : undefined) ??
        randomUUID()
    )
}

function extractRegisteredApprovalRequest(
    params: unknown,
    inputBuilder: (record: Record<string, unknown>) => Record<string, unknown>
): RegisteredApprovalRequest {
    const record = asRecord(params) ?? {}
    return {
        itemId: asString(record.itemId) ?? randomUUID(),
        reason: asString(record.reason),
        input: inputBuilder(record),
    }
}

function registerApprovalRequestHandler(args: {
    client: CodexAppServerClient
    method: 'item/commandExecution/requestApproval' | 'item/fileChange/requestApproval'
    toolName: 'CodexBash' | 'CodexPatch'
    permissionHandler: CodexPermissionHandler
    inputBuilder: (record: Record<string, unknown>) => Record<string, unknown>
}): void {
    args.client.registerRequestHandler(args.method, async (params) => {
        const request = extractRegisteredApprovalRequest(params, args.inputBuilder)
        const result = (await args.permissionHandler.handleToolCall(request.itemId, args.toolName, {
            message: request.reason,
            ...request.input,
        })) as PermissionResult

        return mapDecision(result.decision)
    })
}

export function registerAppServerPermissionHandlers(args: {
    client: CodexAppServerClient
    permissionHandler: CodexPermissionHandler
    onUserInputRequest?: (request: { requestId: string; input: unknown }) => Promise<UserInputAnswers>
}): void {
    const { client, permissionHandler, onUserInputRequest } = args

    registerApprovalRequestHandler({
        client,
        method: 'item/commandExecution/requestApproval',
        toolName: 'CodexBash',
        permissionHandler,
        inputBuilder: (record) => ({
            command: record.command,
            cwd: asString(record.cwd),
        }),
    })

    registerApprovalRequestHandler({
        client,
        method: 'item/fileChange/requestApproval',
        toolName: 'CodexPatch',
        permissionHandler,
        inputBuilder: (record) => ({
            grantRoot: asString(record.grantRoot),
        }),
    })

    client.registerRequestHandler('mcpServer/elicitation/request', async (params) => {
        const request = extractMcpToolPermissionRequest(params)
        if (!request) {
            logger.debug('[CodexAppServer] Unsupported mcpServer/elicitation/request payload; cancelling', params)
            return { action: 'cancel' }
        }

        const result = (await permissionHandler.handleToolCall(
            request.toolCallId,
            request.toolName,
            request.input
        )) as PermissionResult

        return mapElicitationDecision(result.decision)
    })

    client.registerRequestHandler('item/tool/requestUserInput', async (params) => {
        if (!onUserInputRequest) {
            logger.debug('[CodexAppServer] No user-input handler registered; cancelling request')
            return { decision: 'cancel' }
        }

        const answers = await onUserInputRequest({
            requestId: extractUserInputRequestId(params),
            input: params,
        })
        return {
            decision: 'accept',
            answers,
        }
    })
}
