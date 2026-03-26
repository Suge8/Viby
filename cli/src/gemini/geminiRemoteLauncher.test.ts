import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { GeminiMode } from './types'

const harness = vi.hoisted(() => ({
    backendFactoryCalls: [] as Array<Record<string, unknown>>,
    remoteBridgeCalls: 0,
    backendInstances: [] as Array<{
        initialize: ReturnType<typeof vi.fn>
        newSession: ReturnType<typeof vi.fn>
        loadSession: ReturnType<typeof vi.fn>
        setSessionModel: ReturnType<typeof vi.fn>
        prompt: ReturnType<typeof vi.fn>
        disconnect: ReturnType<typeof vi.fn>
        cancelPrompt: ReturnType<typeof vi.fn>
        onStderrError: ReturnType<typeof vi.fn>
    }>,
    permissionCancelReasons: [] as string[],
    sessionEvents: [] as Array<Record<string, unknown>>,
    thinkingChanges: [] as boolean[],
    foundSessionIds: [] as string[],
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
    buildBackendInstance(opts: Record<string, unknown>) {
        harness.backendFactoryCalls.push(opts)
        const backend = {
            initialize: vi.fn(async () => {}),
            newSession: vi.fn(async () => 'acp-session-1'),
            loadSession: vi.fn(async ({ sessionId }: { sessionId: string }) => sessionId),
            setSessionModel: vi.fn(async () => {}),
            prompt: vi.fn(async (_sessionId: string, _content: unknown, _onUpdate: (message: unknown) => void) => {}),
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

vi.mock('./utils/permissionHandler', () => ({
    GeminiPermissionHandler: class {
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

vi.mock('./utils/geminiBackend', () => ({
    createGeminiBackend: vi.fn((opts: Record<string, unknown>) => harness.buildBackendInstance(opts))
}))

import { geminiRemoteLauncher } from './geminiRemoteLauncher'

function createMode(overrides?: Partial<GeminiMode>): GeminiMode {
    return {
        permissionMode: 'default',
        ...overrides
    }
}

function createSessionStub(modes: GeminiMode[]) {
    const queue = new MessageQueue2<GeminiMode>((mode) => JSON.stringify(mode))
    for (const [index, mode] of modes.entries()) {
        queue.push(`hello ${index + 1}`, mode)
    }
    queue.close()
    let remoteBridge: { server: { stop: ReturnType<typeof vi.fn> }; mcpServers: unknown } | null = null
    let remoteBackend: (typeof harness.backendInstances)[number] | null = null
    let remoteBackendKey: string | null = null

    const session = {
        path: '/tmp/viby-gemini',
        logPath: '/tmp/viby-gemini/test.log',
        sessionId: null as string | null,
        queue,
        client: {
            rpcHandlerManager: {
                registerHandler(method: string, handler: (params: unknown) => unknown) {
                    harness.rpcHandlers.set(method, handler)
                }
            }
        },
        getPermissionMode() {
            return 'default' as const
        },
        getModel() {
            return session.sessionId ? modes[modes.length - 1]?.model ?? null : modes[0]?.model ?? null
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
        async ensureRemoteBackend(config: { model?: string | null; hookSettingsPath?: string; permissionMode?: string }) {
            const nextKey = JSON.stringify({
                model: config.model ?? null,
                hookSettingsPath: config.hookSettingsPath ?? null,
                permissionMode: config.permissionMode ?? null
            })
            if (remoteBackend && remoteBackendKey === nextKey) {
                return remoteBackend
            }
            if (remoteBackend) {
                await (remoteBackend.disconnect as unknown as () => Promise<void>)()
            }
            remoteBackend = harness.buildBackendInstance({
                model: config.model ?? undefined,
                resumeSessionId: session.sessionId,
                hookSettingsPath: config.hookSettingsPath,
                cwd: session.path,
                permissionMode: config.permissionMode
            })
            remoteBackendKey = nextKey
            return remoteBackend
        },
        getRemoteBackend() {
            return remoteBackend
        },
        sendSessionEvent(event: Record<string, unknown>) {
            harness.sessionEvents.push(event)
        },
        sendCodexMessage() {},
        onThinkingChange(nextThinking: boolean) {
            harness.thinkingChanges.push(nextThinking)
        }
    }

    return session
}

describe('geminiRemoteLauncher', () => {
    afterEach(() => {
        harness.backendFactoryCalls = []
        harness.remoteBridgeCalls = 0
        harness.backendInstances = []
        harness.permissionCancelReasons = []
        harness.sessionEvents = []
        harness.thinkingChanges = []
        harness.foundSessionIds = []
        harness.rpcHandlers.clear()
    })

    it('reconfigures the backend on the next turn when Gemini model changes and resumes the existing ACP session', async () => {
        const session = createSessionStub([
            createMode({ model: 'gemini-2.5-pro' }),
            createMode({ model: 'gemini-2.5-flash-lite' })
        ])

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro'
        })

        expect(exitReason).toBe('exit')
        expect(harness.backendFactoryCalls).toHaveLength(2)
        expect(harness.backendFactoryCalls[0]).toMatchObject({
            model: 'gemini-2.5-pro',
            resumeSessionId: null
        })
        expect(harness.backendFactoryCalls[1]).toMatchObject({
            model: 'gemini-2.5-flash-lite',
            resumeSessionId: 'acp-session-1'
        })
        expect(harness.backendInstances[0]?.newSession).toHaveBeenCalledTimes(1)
        expect(harness.backendInstances[1]?.loadSession).toHaveBeenCalledWith({
            sessionId: 'acp-session-1',
            cwd: '/tmp/viby-gemini',
            mcpServers: []
        })
        expect(harness.backendInstances[1]?.setSessionModel).toHaveBeenCalledWith(
            'acp-session-1',
            'gemini-2.5-flash-lite'
        )
        expect(harness.backendInstances[0]?.disconnect).toHaveBeenCalledTimes(1)
        expect(harness.foundSessionIds).toEqual(['acp-session-1', 'acp-session-1'])
    })

    it('reuses the same backend when consecutive turns keep the same Gemini mode', async () => {
        const session = createSessionStub([
            createMode({ model: 'gemini-2.5-pro' }),
            createMode({ model: 'gemini-2.5-pro' })
        ])

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro'
        })

        expect(exitReason).toBe('exit')
        expect(harness.backendFactoryCalls).toHaveLength(1)
        expect(harness.backendInstances[0]?.newSession).toHaveBeenCalledTimes(1)
        expect(harness.backendInstances[0]?.loadSession).not.toHaveBeenCalled()
        expect(harness.backendInstances[0]?.setSessionModel).not.toHaveBeenCalled()
        expect(harness.backendInstances[0]?.prompt).toHaveBeenCalledTimes(1)
    })

    it('reuses the session-owned bridge and backend across remote launcher restarts', async () => {
        const session = createSessionStub([
            createMode({ model: 'gemini-2.5-pro' })
        ])

        await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro'
        })
        session.queue = new MessageQueue2<GeminiMode>((mode) => JSON.stringify(mode))
        session.queue.push('hello again', createMode({ model: 'gemini-2.5-pro' }))
        session.queue.close()
        await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro'
        })

        expect(harness.remoteBridgeCalls).toBe(1)
        expect(harness.backendFactoryCalls).toHaveLength(1)
        expect(harness.backendInstances[0]?.loadSession).toHaveBeenCalledWith({
            sessionId: 'acp-session-1',
            cwd: '/tmp/viby-gemini',
            mcpServers: []
        })
    })

    it('resets a resumed ACP session back to Gemini auto mode when the live model is cleared', async () => {
        const session = createSessionStub([
            createMode({ model: 'gemini-2.5-pro' }),
            createMode()
        ])

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro'
        })

        expect(exitReason).toBe('exit')
        expect(harness.backendFactoryCalls).toHaveLength(2)
        expect(harness.backendInstances[1]?.loadSession).toHaveBeenCalledWith({
            sessionId: 'acp-session-1',
            cwd: '/tmp/viby-gemini',
            mcpServers: []
        })
        expect(harness.backendInstances[1]?.setSessionModel).toHaveBeenCalledWith(
            'acp-session-1',
            'auto'
        )
    })
})
