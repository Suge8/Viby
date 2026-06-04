import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { GeminiMode } from './types'

const harness = vi.hoisted(() => ({
    backendFactoryCalls: [] as Array<Record<string, unknown>>,
    remoteBridgeCalls: 0,
    nextSessionIds: [] as string[],
    loadSessionFailuresRemaining: 0,
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
    foundSessionIds: [] as string[],
    rpcHandlers: new Map<string, (params: unknown) => unknown>(),
    buildRemoteBridge() {
        harness.remoteBridgeCalls += 1
        return {
            server: {
                stop: vi.fn(),
            },
            mcpServers: {},
        }
    },
    buildBackendInstance(opts: Record<string, unknown>) {
        harness.backendFactoryCalls.push(opts)
        const fallbackSessionId = `acp-session-${harness.backendInstances.length + 1}`
        const backend = {
            initialize: vi.fn(async () => {}),
            newSession: vi.fn(async () => harness.nextSessionIds.shift() ?? fallbackSessionId),
            loadSession: vi.fn(async ({ sessionId }: { sessionId: string }) => {
                if (harness.loadSessionFailuresRemaining > 0) {
                    harness.loadSessionFailuresRemaining -= 1
                    throw new Error('resume failed')
                }
                return sessionId
            }),
            setSessionModel: vi.fn(async () => {}),
            prompt: vi.fn(async () => {}),
            disconnect: vi.fn(async () => {}),
            cancelPrompt: vi.fn(async () => {}),
            onStderrError: vi.fn(),
        }
        harness.backendInstances.push(backend)
        return backend
    },
}))

vi.mock('react', () => ({
    default: {
        createElement: vi.fn(() => null),
    },
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
    },
}))

vi.mock('@/codex/utils/buildVibyMcpBridge', () => ({
    buildVibyMcpBridge: vi.fn(async () => harness.buildRemoteBridge()),
}))

vi.mock('@/agent/acpAgentInterop', () => ({
    forwardAcpAgentMessage: vi.fn(),
    toAcpMcpServers: vi.fn(() => []),
}))

vi.mock('./utils/geminiBackend', () => ({
    createGeminiBackend: vi.fn((opts: Record<string, unknown>) => harness.buildBackendInstance(opts)),
}))

vi.mock('./utils/permissionHandler', () => ({
    GeminiPermissionHandler: class {
        async cancelAll() {}
    },
}))

vi.mock('@/modules/common/remote/RemoteLauncherBase', () => ({
    RemoteLauncherBase: class {
        protected readonly messageBuffer = {
            addMessage() {},
            clear() {},
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
            handlers: { onAbort: () => Promise<void> | void; onSwitch?: () => Promise<void> | void }
        ): void {
            rpcHandlerManager.registerHandler('abort', handlers.onAbort)
            rpcHandlerManager.registerHandler('switch', async () => {})
        }

        protected clearAbortHandlers() {}

        protected async start(): Promise<'switch' | 'exit'> {
            await (this as unknown as { runMainLoop: () => Promise<void> }).runMainLoop()
            await (this as unknown as { cleanup: () => Promise<void> }).cleanup()
            return this.exitReason ?? 'exit'
        }
    },
}))

import { geminiRemoteLauncher } from './geminiRemoteLauncher'

function createMode(overrides?: Partial<GeminiMode>): GeminiMode {
    return {
        permissionMode: 'default',
        ...overrides,
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
                },
            },
        },
        getPermissionMode() {
            return 'default' as const
        },
        getModel() {
            return session.sessionId ? (modes[modes.length - 1]?.model ?? null) : (modes[0]?.model ?? null)
        },
        onSessionFound(id: string) {
            session.sessionId = id
            harness.foundSessionIds.push(id)
        },
        setRuntimeStopHandler() {},
        async ensureRemoteBridge() {
            if (!remoteBridge) {
                remoteBridge = harness.buildRemoteBridge()
            }
            return remoteBridge
        },
        async ensureRemoteBackend(config: {
            model?: string | null
            hookSettingsPath?: string
            permissionMode?: string
        }) {
            const nextKey = JSON.stringify({
                model: config.model ?? null,
                hookSettingsPath: config.hookSettingsPath ?? null,
                permissionMode: config.permissionMode ?? null,
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
                permissionMode: config.permissionMode,
            })
            remoteBackendKey = nextKey
            return remoteBackend
        },
        sendSessionEvent() {},
        sendCodexMessage() {},
        onThinkingChange() {},
    }

    return session
}

describe('geminiRemoteLauncher runtime reuse', () => {
    afterEach(() => {
        harness.backendFactoryCalls = []
        harness.remoteBridgeCalls = 0
        harness.nextSessionIds = []
        harness.loadSessionFailuresRemaining = 0
        harness.backendInstances = []
        harness.foundSessionIds = []
        harness.rpcHandlers.clear()
    })

    it('reuses the session-owned bridge and backend across remote launcher restarts', async () => {
        const session = createSessionStub([createMode({ model: 'gemini-2.5-pro' })])

        await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro',
        })
        session.queue = new MessageQueue2<GeminiMode>((mode) => JSON.stringify(mode))
        session.queue.push('hello again', createMode({ model: 'gemini-2.5-pro' }))
        session.queue.close()
        await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro',
        })

        expect(harness.remoteBridgeCalls).toBe(1)
        expect(harness.backendFactoryCalls).toHaveLength(1)
        expect(harness.backendInstances[0]?.loadSession).toHaveBeenCalledWith({
            sessionId: 'acp-session-1',
            cwd: '/tmp/viby-gemini',
            mcpServers: [],
        })
    })

    it('resets a resumed ACP session back to Gemini auto mode when the live model is cleared', async () => {
        const session = createSessionStub([createMode({ model: 'gemini-2.5-pro' }), createMode()])

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro',
        })

        expect(exitReason).toBe('exit')
        expect(harness.backendFactoryCalls).toHaveLength(2)
        expect(harness.backendInstances[1]?.loadSession).toHaveBeenCalledWith({
            sessionId: 'acp-session-1',
            cwd: '/tmp/viby-gemini',
            mcpServers: [],
        })
        expect(harness.backendInstances[1]?.setSessionModel).toHaveBeenCalledWith('acp-session-1', 'auto')
    })

    it('keeps prompting after backend reconfiguration falls back to a fresh ACP session', async () => {
        harness.nextSessionIds = ['acp-session-1', 'acp-session-2']
        harness.loadSessionFailuresRemaining = 1

        const session = createSessionStub([
            createMode({ model: 'gemini-2.5-pro' }),
            createMode({ model: 'gemini-2.5-flash-lite' }),
        ])

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro',
        })

        expect(exitReason).toBe('exit')
        expect(harness.backendInstances[0]?.prompt).toHaveBeenCalledWith(
            'acp-session-1',
            [
                {
                    type: 'text',
                    text: 'hello 1',
                },
            ],
            expect.any(Function)
        )
        expect(harness.backendInstances[1]?.prompt).toHaveBeenCalledWith(
            'acp-session-2',
            [
                {
                    type: 'text',
                    text: 'hello 2',
                },
            ],
            expect.any(Function)
        )
        expect(harness.foundSessionIds).toEqual(['acp-session-1', 'acp-session-2'])
    })
})
