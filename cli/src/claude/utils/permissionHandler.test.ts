import { describe, expect, it } from 'vitest'
import { PLAN_FAKE_REJECT, PLAN_FAKE_RESTART } from '../sdk/prompts'
import { PermissionHandler } from './permissionHandler'

function createHandler() {
    const unshiftCalls: unknown[][] = []
    let permissionRpc:
        | ((response: { id: string; approved: boolean; answers?: Record<string, string[]> }) => void)
        | null = null
    const session = {
        client: {
            rpcHandlerManager: {
                registerHandler(_method: string, handler: typeof permissionRpc) {
                    permissionRpc = handler
                },
            },
            updateAgentState(
                handler: (state: {
                    requests: Record<string, unknown>
                    completedRequests: Record<string, unknown>
                }) => unknown
            ) {
                handler({ requests: {}, completedRequests: {} })
            },
        },
        queue: {
            unshift: (...args: unknown[]) => {
                unshiftCalls.push(args)
            },
        },
        setPermissionMode() {},
    }
    return {
        handler: new PermissionHandler(session as never),
        respondToPermission: (response: { id: string; approved: boolean; answers?: Record<string, string[]> }) => {
            if (!permissionRpc) {
                throw new Error('permission RPC was not registered')
            }
            permissionRpc(response)
        },
        unshiftCalls,
    }
}

describe('PermissionHandler', () => {
    it('keeps plan execution routed through the plan restart chain in bypass mode', async () => {
        const { handler, unshiftCalls } = createHandler()
        handler.handleModeChange('bypassPermissions')

        const result = await handler.handleToolCall('exit_plan_mode', {}, 'default' as never, {
            signal: new AbortController().signal,
        })

        expect(result).toEqual({ behavior: 'deny', message: PLAN_FAKE_REJECT })
        expect(unshiftCalls).toEqual([[PLAN_FAKE_RESTART, { permissionMode: 'bypassPermissions' }]])
    })

    it('denies Claude question answers that cannot be mapped to question text', async () => {
        const { handler, respondToPermission } = createHandler()
        const input = { questions: [] }

        handler.onMessage({
            type: 'assistant',
            message: {
                content: [{ type: 'tool_use', id: 'tool-1', name: 'AskUserQuestion', input }],
            },
        } as never)

        const resultPromise = handler.handleToolCall('AskUserQuestion', input, 'default' as never, {
            signal: new AbortController().signal,
        })
        respondToPermission({ id: 'tool-1', approved: true, answers: { '0': ['Yes'] } })

        await expect(resultPromise).resolves.toEqual({
            behavior: 'deny',
            message: 'No matching question answers were provided.',
        })
    })
})
