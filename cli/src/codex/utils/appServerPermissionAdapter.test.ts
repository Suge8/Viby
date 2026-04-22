import { describe, expect, it, vi } from 'vitest'
import type { ApiSessionClient } from '@/api/apiSession'
import { registerAppServerPermissionHandlers } from './appServerPermissionAdapter'
import { CodexPermissionHandler } from './permissionHandler'

type FakeAgentState = {
    requests: Record<string, unknown>
    completedRequests: Record<string, unknown>
}

function createPermissionHarness(mode: 'default' | 'read-only' | 'safe-yolo' | 'yolo') {
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {},
    }

    const rpcHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>()
    const session = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => Promise<unknown> | unknown) {
                rpcHandlers.set(method, handler)
            },
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState)
        },
    } as unknown as ApiSessionClient

    return {
        permissionHandler: new CodexPermissionHandler(session, () => mode),
        getAgentState: () => agentState,
    }
}

function createClientHarness() {
    const requestHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>()
    return {
        client: {
            registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown> | unknown) {
                requestHandlers.set(method, handler)
            },
        },
        requestHandlers,
    }
}

describe('registerAppServerPermissionHandlers', () => {
    it('cancels unsupported elicitation payloads instead of throwing', async () => {
        const { permissionHandler } = createPermissionHarness('default')
        const { client, requestHandlers } = createClientHarness()

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler,
        })

        const handler = requestHandlers.get('mcpServer/elicitation/request')
        await expect(
            handler?.({
                requestedSchema: {
                    type: 'object',
                },
            })
        ).resolves.toEqual({
            action: 'cancel',
        })
    })

    it('keeps the legacy approval and user-input request handlers registered', () => {
        const { permissionHandler } = createPermissionHarness('default')
        const { client, requestHandlers } = createClientHarness()

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler,
            onUserInputRequest: vi.fn(async () => ({ answer: ['ok'] })),
        })

        expect(Array.from(requestHandlers.keys())).toEqual([
            'item/commandExecution/requestApproval',
            'item/fileChange/requestApproval',
            'mcpServer/elicitation/request',
            'item/tool/requestUserInput',
        ])
    })

    it('bridges item/tool/requestUserInput through the provided request owner with a stable request id', async () => {
        const { permissionHandler } = createPermissionHarness('default')
        const { client, requestHandlers } = createClientHarness()
        const onUserInputRequest = vi.fn(async () => ({ risk: { answers: ['Low'] } }))

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler,
            onUserInputRequest,
        })

        const handler = requestHandlers.get('item/tool/requestUserInput')
        await expect(
            handler?.({
                threadId: 'thread-1',
                turnId: 'turn-9',
                questions: [{ id: 'risk', question: 'How risky is this?' }],
            })
        ).resolves.toEqual({
            decision: 'accept',
            answers: {
                risk: { answers: ['Low'] },
            },
        })

        expect(onUserInputRequest).toHaveBeenCalledWith({
            requestId: 'thread-1:turn-9:request_user_input',
            input: {
                threadId: 'thread-1',
                turnId: 'turn-9',
                questions: [{ id: 'risk', question: 'How risky is this?' }],
            },
        })
    })
})
