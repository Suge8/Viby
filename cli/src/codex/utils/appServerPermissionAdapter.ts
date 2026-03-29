import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import type { CodexPermissionHandler } from './permissionHandler';
import type { CodexAppServerClient } from '../codexAppServerClient';

type PermissionDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort';

type PermissionResult = {
    decision: PermissionDecision;
    reason?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function mapDecision(decision: PermissionDecision): { decision: string } {
    switch (decision) {
        case 'approved':
            return { decision: 'accept' };
        case 'approved_for_session':
            return { decision: 'acceptForSession' };
        case 'denied':
            return { decision: 'decline' };
        case 'abort':
            return { decision: 'cancel' };
    }
}

function mapElicitationDecision(decision: PermissionDecision): { action: 'accept' | 'decline' | 'cancel' } {
    switch (decision) {
        case 'approved':
        case 'approved_for_session':
            return { action: 'accept' };
        case 'denied':
            return { action: 'decline' };
        case 'abort':
            return { action: 'cancel' };
    }
}

function asToolName(value: unknown): string | undefined {
    const toolName = asString(value);
    return toolName && toolName.trim().length > 0 ? toolName.trim() : undefined;
}

function extractToolNameFromApprovalMessage(message: string | undefined): string | undefined {
    if (!message) {
        return undefined;
    }

    const match = message.match(/tool "([^"]+)"/i);
    return match?.[1]?.trim() || undefined;
}

function buildScopedToolName(serverName: string | undefined, toolName: string | undefined): string | undefined {
    if (!toolName) {
        return undefined;
    }
    return serverName ? `mcp__${serverName}__${toolName}` : toolName;
}

function extractMcpToolPermissionRequest(params: unknown): {
    toolCallId: string;
    toolName: string;
    input: unknown;
} | null {
    const record = asRecord(params);
    if (!record) {
        return null;
    }

    const meta = asRecord(record._meta) ?? {};
    const nested = asRecord(record.toolCall)
        ?? asRecord(record.toolInvocation)
        ?? asRecord(record.request)
        ?? asRecord(record.item);
    const source = nested ?? record;

    const serverName = asString(source.serverName)
        ?? asString(source.server)
        ?? asString(record.serverName)
        ?? asString(record.server);
    const toolName = buildScopedToolName(
        serverName,
        asToolName(source.toolName)
        ?? asToolName(source.tool)
        ?? asToolName(source.name)
        ?? asToolName(record.toolName)
        ?? asToolName(record.tool)
        ?? asToolName(record.name)
        ?? extractToolNameFromApprovalMessage(asString(record.message))
    );

    if (!toolName) {
        return null;
    }

    const threadId = asString(record.threadId);
    const turnId = asString(record.turnId);

    return {
        toolCallId: asString(source.toolCallId)
            ?? asString(source.callId)
            ?? asString(source.itemId)
            ?? asString(record.toolCallId)
            ?? asString(record.callId)
            ?? asString(record.itemId)
            ?? (threadId && turnId ? `${threadId}:${turnId}:${toolName}` : undefined)
            ?? randomUUID(),
        toolName,
        input: meta.tool_params
            ?? source.arguments
            ?? source.input
            ?? source.params
            ?? record.arguments
            ?? record.input
            ?? record.params
            ?? {},
    };
}

export function registerAppServerPermissionHandlers(args: {
    client: CodexAppServerClient;
    permissionHandler: CodexPermissionHandler;
    onUserInputRequest?: (request: unknown) => Promise<Record<string, string[]>>;
}): void {
    const { client, permissionHandler, onUserInputRequest } = args;

    client.registerRequestHandler('item/commandExecution/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const command = record.command;
        const cwd = asString(record.cwd);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexBash',
            {
                message: reason,
                command,
                cwd
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('item/fileChange/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const grantRoot = asString(record.grantRoot);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexPatch',
            {
                message: reason,
                grantRoot
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('mcpServer/elicitation/request', async (params) => {
        const request = extractMcpToolPermissionRequest(params);
        if (!request) {
            logger.debug('[CodexAppServer] Unsupported mcpServer/elicitation/request payload; cancelling', params);
            return { action: 'cancel' };
        }

        const result = await permissionHandler.handleToolCall(
            request.toolCallId,
            request.toolName,
            request.input
        ) as PermissionResult;

        return mapElicitationDecision(result.decision);
    });

    client.registerRequestHandler('item/tool/requestUserInput', async (params) => {
        if (!onUserInputRequest) {
            logger.debug('[CodexAppServer] No user-input handler registered; cancelling request');
            return { decision: 'cancel' };
        }

        const answers = await onUserInputRequest(params);
        return {
            decision: 'accept',
            answers
        };
    });
}
