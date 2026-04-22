import { describe, expect, it } from 'vitest'
import type { ApiSessionClient } from '@/api/apiSession'
import type { CopilotSession } from '../session'
import type { PermissionMode } from '../types'
import { CopilotPermissionHandler } from './permissionHandler'

type FakeAgentState = {
    requests: Record<string, unknown>
    completedRequests: Record<string, unknown>
}

function createHarness(initialMode: PermissionMode = 'default') {
    let currentMode = initialMode
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {},
    }

    const rpcHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>()
    const client = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => Promise<unknown> | unknown) {
                rpcHandlers.set(method, handler)
            },
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState)
        },
    } as unknown as ApiSessionClient

    const session = {
        client,
        get currentPermissionMode() {
            return currentMode
        },
        setPermissionMode(mode: PermissionMode) {
            currentMode = mode
        },
    } as unknown as CopilotSession

    const handler = new CopilotPermissionHandler(session)

    return {
        handler,
        rpcHandlers,
        getAgentState: () => agentState,
        getCurrentMode: () => currentMode,
    }
}

describe('CopilotPermissionHandler', () => {
    it('persists allow-for-session shell approvals and auto-approves matching commands', async () => {
        const { handler, rpcHandlers, getAgentState } = createHarness()
        const permissionHandler = handler.buildHandler()

        const pendingResult = permissionHandler(
            { kind: 'shell', toolCallId: 'perm-1', fullCommandText: 'pwd' },
            { sessionId: 'sdk-session-1' }
        )
        expect(getAgentState().requests).toMatchObject({
            'perm-1': {
                tool: 'Bash',
                arguments: { command: 'pwd' },
            },
        })

        const permissionRpc = rpcHandlers.get('permission')
        expect(permissionRpc).toBeTypeOf('function')

        await permissionRpc?.({
            id: 'perm-1',
            approved: true,
            allowTools: ['Bash(pwd)'],
            decision: 'approved_for_session',
        })
        await expect(Promise.resolve(pendingResult)).resolves.toEqual({ kind: 'approved' })

        await expect(
            Promise.resolve(
                permissionHandler(
                    { kind: 'shell', toolCallId: 'perm-2', fullCommandText: 'pwd' },
                    { sessionId: 'sdk-session-1' }
                )
            )
        ).resolves.toEqual({ kind: 'approved' })

        expect(getAgentState().completedRequests).toMatchObject({
            'perm-1': {
                status: 'approved',
                decision: 'approved_for_session',
            },
            'perm-2': {
                tool: 'Bash',
                status: 'approved',
                decision: 'approved_for_session',
            },
        })
    })

    it('switches into acceptEdits mode and auto-approves later write requests', async () => {
        const { handler, rpcHandlers, getAgentState, getCurrentMode } = createHarness()
        const permissionHandler = handler.buildHandler()

        const pendingResult = permissionHandler(
            { kind: 'write', toolCallId: 'perm-1', fileName: 'README.md' },
            { sessionId: 'sdk-session-1' }
        )

        const permissionRpc = rpcHandlers.get('permission')
        expect(permissionRpc).toBeTypeOf('function')

        await permissionRpc?.({
            id: 'perm-1',
            approved: true,
            mode: 'acceptEdits',
            decision: 'approved',
        })
        await expect(Promise.resolve(pendingResult)).resolves.toEqual({ kind: 'approved' })
        expect(getCurrentMode()).toBe('acceptEdits')

        await expect(
            Promise.resolve(
                permissionHandler(
                    { kind: 'write', toolCallId: 'perm-2', fileName: 'docs/README.md' },
                    { sessionId: 'sdk-session-1' }
                )
            )
        ).resolves.toEqual({ kind: 'approved' })

        expect(getAgentState().completedRequests).toMatchObject({
            'perm-2': {
                tool: 'Write',
                status: 'approved',
                mode: 'acceptEdits',
            },
        })
    })

    it('auto-approves safe read requests without queueing a UI permission', async () => {
        const { handler, getAgentState } = createHarness()
        const permissionHandler = handler.buildHandler()

        await expect(
            Promise.resolve(
                permissionHandler(
                    { kind: 'read', toolCallId: 'perm-read', fileName: 'README.md' },
                    { sessionId: 'sdk-session-1' }
                )
            )
        ).resolves.toEqual({ kind: 'approved' })

        expect(getAgentState().requests).toEqual({})
        expect(getAgentState().completedRequests).toMatchObject({
            'perm-read': {
                tool: 'Read',
                status: 'approved',
                decision: 'approved',
            },
        })
    })

    it('persists Bash prefix approvals across later matching commands', async () => {
        const { handler, rpcHandlers, getAgentState } = createHarness()
        const permissionHandler = handler.buildHandler()

        const pendingResult = permissionHandler(
            { kind: 'shell', toolCallId: 'perm-prefix-1', fullCommandText: 'git status --short' },
            { sessionId: 'sdk-session-1' }
        )

        await rpcHandlers.get('permission')?.({
            id: 'perm-prefix-1',
            approved: true,
            allowTools: ['Bash(git status:*)'],
            decision: 'approved_for_session',
        })
        await expect(Promise.resolve(pendingResult)).resolves.toEqual({ kind: 'approved' })

        await expect(
            Promise.resolve(
                permissionHandler(
                    { kind: 'shell', toolCallId: 'perm-prefix-2', fullCommandText: 'git status --branch' },
                    { sessionId: 'sdk-session-1' }
                )
            )
        ).resolves.toEqual({ kind: 'approved' })

        expect(getAgentState().completedRequests).toMatchObject({
            'perm-prefix-2': {
                tool: 'Bash',
                decision: 'approved_for_session',
                status: 'approved',
            },
        })
    })

    it('persists non-Bash allowTools approvals across later tool requests', async () => {
        const { handler, rpcHandlers, getAgentState } = createHarness()
        const permissionHandler = handler.buildHandler()

        const pendingResult = permissionHandler(
            { kind: 'mcp', toolCallId: 'perm-tool-1', toolName: 'Read', arguments: { filePath: 'README.md' } },
            { sessionId: 'sdk-session-1' }
        )

        await rpcHandlers.get('permission')?.({
            id: 'perm-tool-1',
            approved: true,
            allowTools: ['Read'],
            decision: 'approved_for_session',
        })
        await expect(Promise.resolve(pendingResult)).resolves.toEqual({ kind: 'approved' })

        await expect(
            Promise.resolve(
                permissionHandler(
                    { kind: 'read', toolCallId: 'perm-tool-2', fileName: 'docs/README.md' },
                    { sessionId: 'sdk-session-1' }
                )
            )
        ).resolves.toEqual({ kind: 'approved' })

        expect(getAgentState().completedRequests).toMatchObject({
            'perm-tool-2': {
                tool: 'Read',
                decision: 'approved_for_session',
                status: 'approved',
            },
        })
    })
})
