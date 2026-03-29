import { describe, expect, it, vi } from 'vitest';
import type { ApiSessionClient } from '@/api/apiSession';
import { CodexPermissionHandler } from './permissionHandler';
import { registerAppServerPermissionHandlers } from './appServerPermissionAdapter';

type FakeAgentState = {
    requests: Record<string, unknown>;
    completedRequests: Record<string, unknown>;
};

function createPermissionHarness(mode: 'default' | 'read-only' | 'safe-yolo' | 'yolo') {
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {}
    };

    const rpcHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>();
    const session = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => Promise<unknown> | unknown) {
                rpcHandlers.set(method, handler);
            }
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState);
        }
    } as unknown as ApiSessionClient;

    return {
        permissionHandler: new CodexPermissionHandler(session, () => mode),
        getAgentState: () => agentState
    };
}

function createClientHarness() {
    const requestHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>();
    return {
        client: {
            registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown> | unknown) {
                requestHandlers.set(method, handler);
            }
        },
        requestHandlers
    };
}

describe('registerAppServerPermissionHandlers', () => {
    it('auto-approves manager snapshot elicitation requests through the permission handler', async () => {
        const { permissionHandler, getAgentState } = createPermissionHarness('default');
        const { client, requestHandlers } = createClientHarness();

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler
        });

        const handler = requestHandlers.get('mcpServer/elicitation/request');
        expect(handler).toBeTypeOf('function');

        await expect(handler?.({
            server: 'viby',
            toolName: 'team_get_snapshot',
            arguments: {},
            toolCallId: 'call-1'
        })).resolves.toEqual({
            action: 'accept'
        });

        expect(getAgentState().completedRequests).toMatchObject({
            'call-1': {
                tool: 'mcp__viby__team_get_snapshot',
                status: 'approved',
                decision: 'approved'
            }
        });
    });

    it('extracts tool name and params from the real elicitation payload shape', async () => {
        const { permissionHandler, getAgentState } = createPermissionHarness('default');
        const { client, requestHandlers } = createClientHarness();

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler
        });

        const handler = requestHandlers.get('mcpServer/elicitation/request');
        await expect(handler?.({
            threadId: 'thread-1',
            turnId: 'turn-1',
            serverName: 'viby',
            mode: 'form',
            message: 'Allow the viby MCP server to run tool "team_get_snapshot"?',
            _meta: {
                codex_approval_kind: 'mcp_tool_call',
                tool_title: 'Get Team Snapshot',
                tool_description: 'Fetch the authoritative snapshot',
                tool_params: {}
            },
            requestedSchema: {
                type: 'object',
                properties: {}
            }
        })).resolves.toEqual({
            action: 'accept'
        });

        expect(getAgentState().completedRequests).toMatchObject({
            'thread-1:turn-1:mcp__viby__team_get_snapshot': {
                tool: 'mcp__viby__team_get_snapshot',
                status: 'approved',
                decision: 'approved'
            }
        });
    });

    it('cancels unsupported elicitation payloads instead of throwing', async () => {
        const { permissionHandler } = createPermissionHarness('default');
        const { client, requestHandlers } = createClientHarness();

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler
        });

        const handler = requestHandlers.get('mcpServer/elicitation/request');
        await expect(handler?.({
            requestedSchema: {
                type: 'object'
            }
        })).resolves.toEqual({
            action: 'cancel'
        });
    });

    it('keeps the legacy approval and user-input request handlers registered', () => {
        const { permissionHandler } = createPermissionHarness('default');
        const { client, requestHandlers } = createClientHarness();

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler,
            onUserInputRequest: vi.fn(async () => ({ answer: ['ok'] }))
        });

        expect(Array.from(requestHandlers.keys())).toEqual([
            'item/commandExecution/requestApproval',
            'item/fileChange/requestApproval',
            'mcpServer/elicitation/request',
            'item/tool/requestUserInput'
        ]);
    });
});
