import { describe, expect, it } from 'vitest'
import { PLAN_FAKE_REJECT, PLAN_FAKE_RESTART } from '../sdk/prompts'
import { PermissionHandler } from './permissionHandler'

function createHandler() {
    const unshiftCalls: unknown[][] = []
    const session = {
        client: {
            rpcHandlerManager: {
                registerHandler() {},
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
})
