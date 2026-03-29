import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { OpencodeMode } from './types'

const harness = vi.hoisted(() => ({
    remoteBridgeCalls: 0,
    backendFactoryCalls: 0,
    backendInstances: [] as Array<{
        initialize: ReturnType<typeof vi.fn>
        newSession: ReturnType<typeof vi.fn>
        loadSession: ReturnType<typeof vi.fn>
        prompt: ReturnType<typeof vi.fn>
        disconnect: ReturnType<typeof vi.fn>
        cancelPrompt: ReturnType<typeof vi.fn>
        onStderrError: ReturnType<typeof vi.fn>
    }>,
    sessionEvents: [] as Array<Record<string, unknown>>,
    foundSessionIds: [] as string[],
    permissionCancelReasons: [] as string[],
    rpcHandlers: new Map<string, (params: unknown) => unknown>(),
    buildRemoteBridge() {
        harness.remoteBridgeCalls += 1
        return {
            server: {
                stop: vi.fn()
            },
            mcpServers: {}
        }
    },
    buildBackendInstance() {
        harness.backendFactoryCalls += 1
        const backend = {
            initialize: vi.fn(async () => {}),
            newSession: vi.fn(async () => 'opencode-session-1'),
            loadSession: vi.fn(async ({ sessionId }: { sessionId: string }) => sessionId),
            prompt: vi.fn(async () => {}),
            disconnect: vi.fn(async () => {}),
            cancelPrompt: vi.fn(async () => {}),
            onStderrError: vi.fn()
        }
        harness.backendInstances.push(backend)
        return backend
    }
}))

vi.mock('react', () => ({
    default: {
        createElement: vi.fn(() => null)
    }
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn()
    }
}))

vi.mock('@/codex/utils/buildVibyMcpBridge', () => ({
    buildVibyMcpBridge: vi.fn(async () => harness.buildRemoteBridge())
}))

vi.mock('@/agent/acpAgentInterop', () => ({
    forwardAcpAgentMessage: vi.fn(),
    toAcpMcpServers: vi.fn(() => [])
}))

vi.mock('@/agent/teamPromptContract', async () => {
    const actual = await vi.importActual<typeof import('@/agent/teamPromptContract')>('@/agent/teamPromptContract')
    return {
        ...actual,
        resolveTeamRolePromptContract: vi.fn(() => 'Manager team contract')
    }
})

vi.mock('./utils/opencodeBackend', () => ({
    createOpencodeBackend: vi.fn(() => harness.buildBackendInstance())
}))

vi.mock('./utils/permissionHandler', () => ({
    OpencodePermissionHandler: class {
        async cancelAll(reason: string) {
            harness.permissionCancelReasons.push(reason)
        }
    }
}))

vi.mock('@/modules/common/remote/RemoteLauncherBase', () => ({
    RemoteLauncherBase: class {
        protected readonly messageBuffer = {
            addMessage() {},
            clear() {}
        }
        protected readonly hasTTY = false
        protected readonly logPath?: string
        protected exitReason: 'switch' | 'exit' | null = null
        protected shouldExit = false

        constructor(logPath?: string) {
            this.logPath = logPath
        }

        protected setupAbortHandlers(
            rpcHandlerManager: { registerHandler: (method: string, handler: (params: unknown) => unknown) => void },
            handlers: { onAbort: () => Promise<void> | void; onSwitch: () => Promise<void> | void }
        ): void {
            rpcHandlerManager.registerHandler('abort', handlers.onAbort)
            rpcHandlerManager.registerHandler('switch', handlers.onSwitch)
        }

        protected clearAbortHandlers(
            rpcHandlerManager: { registerHandler: (method: string, handler: (params: unknown) => unknown) => void }
        ): void {
            rpcHandlerManager.registerHandler('abort', async () => {})
            rpcHandlerManager.registerHandler('switch', async () => {})
        }

        protected async requestExit(
            reason: 'switch' | 'exit',
            handler: () => Promise<void> | void
        ): Promise<void> {
            if (!this.exitReason) {
                this.exitReason = reason
            }
            this.shouldExit = true
            await handler()
        }

        protected async start(): Promise<'switch' | 'exit'> {
            try {
                await (this as unknown as { runMainLoop: () => Promise<void> }).runMainLoop()
            } finally {
                await (this as unknown as { cleanup: () => Promise<void> }).cleanup()
            }
            return this.exitReason ?? 'exit'
        }
    }
}))

import { opencodeRemoteLauncher } from './opencodeRemoteLauncher'

function createMode(): OpencodeMode {
    return {
        permissionMode: 'default'
    }
}

function createSessionStub(messageCount: number = 1) {
    const queue = new MessageQueue2<OpencodeMode>((mode) => JSON.stringify(mode))
    for (let index = 0; index < messageCount; index += 1) {
        queue.push(`hello ${index + 1}`, createMode())
    }
    queue.close()
    let remoteBridge: { server: { stop: ReturnType<typeof vi.fn> }; mcpServers: unknown } | null = null
    let remoteBackend: (typeof harness.backendInstances)[number] | null = null

    const session = {
        path: '/tmp/viby-opencode',
        logPath: '/tmp/viby-opencode/test.log',
        sessionId: null as string | null,
        queue,
        client: {
            getTeamContextSnapshot() {
                return {
                    projectId: 'project-1',
                    sessionRole: 'manager',
                    managerSessionId: 'manager-session-1',
                    projectStatus: 'active'
                }
            },
            rpcHandlerManager: {
                registerHandler(method: string, handler: (params: unknown) => unknown) {
                    harness.rpcHandlers.set(method, handler)
                }
            }
        },
        getPermissionMode() {
            return 'default' as const
        },
        onSessionFound(id: string) {
            session.sessionId = id
            harness.foundSessionIds.push(id)
        },
        async ensureRemoteBridge() {
            if (!remoteBridge) {
                remoteBridge = harness.buildRemoteBridge()
            }
            return remoteBridge
        },
        ensureRemoteBackend() {
            if (!remoteBackend) {
                remoteBackend = harness.buildBackendInstance()
            }
            return remoteBackend
        },
        getRemoteBackend() {
            return remoteBackend
        },
        sendSessionEvent(event: Record<string, unknown>) {
            harness.sessionEvents.push(event)
        },
        sendCodexMessage() {},
        onThinkingChange() {}
    }

    return session
}

describe('opencodeRemoteLauncher', () => {
    afterEach(() => {
        harness.remoteBridgeCalls = 0
        harness.backendFactoryCalls = 0
        harness.backendInstances = []
        harness.sessionEvents = []
        harness.foundSessionIds = []
        harness.permissionCancelReasons = []
        harness.rpcHandlers.clear()
    })

    it('reuses the session-owned bridge and backend across remote launcher restarts', async () => {
        const session = createSessionStub()

        await opencodeRemoteLauncher(session as never)
        session.queue = new MessageQueue2<OpencodeMode>((mode) => JSON.stringify(mode))
        session.queue.push('hello again', createMode())
        session.queue.close()
        await opencodeRemoteLauncher(session as never)

        expect(harness.remoteBridgeCalls).toBe(1)
        expect(harness.backendFactoryCalls).toBe(1)
        expect(harness.backendInstances[0]?.initialize).toHaveBeenCalledTimes(2)
        expect(harness.backendInstances[0]?.loadSession).toHaveBeenCalledWith({
            sessionId: 'opencode-session-1',
            cwd: '/tmp/viby-opencode',
            mcpServers: []
        })
        expect(harness.backendInstances[0]?.prompt).toHaveBeenCalledWith(
            'opencode-session-1',
            [{
                type: 'text',
                text: expect.stringContaining('Manager team contract')
            }],
            expect.any(Function)
        )
    })
})
