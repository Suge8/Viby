import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { GeminiMode } from './types'

const harness = vi.hoisted(() => ({
    sessionEvents: [] as Array<Record<string, unknown>>,
    backend: {
        initialize: vi.fn(async () => {}),
        newSession: vi.fn(async () => 'acp-session-1'),
        loadSession: vi.fn(async ({ sessionId }: { sessionId: string }) => sessionId),
        setSessionModel: vi.fn(async () => {}),
        prompt: vi.fn(async () => {
            throw new Error('provider unavailable')
        }),
        disconnect: vi.fn(async () => {}),
        cancelPrompt: vi.fn(async () => {}),
        onStderrError: vi.fn(),
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
    buildVibyMcpBridge: vi.fn(async () => ({
        server: { stop: vi.fn() },
        mcpServers: {},
    })),
}))

vi.mock('@/agent/acpAgentInterop', () => ({
    forwardAcpAgentMessage: vi.fn(),
    toAcpMcpServers: vi.fn(() => []),
}))

vi.mock('./utils/geminiBackend', () => ({
    createGeminiBackend: vi.fn(() => harness.backend),
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

function createSessionStub() {
    const queue = new MessageQueue2<GeminiMode>((mode) => JSON.stringify(mode))
    queue.push('hello', { permissionMode: 'default', model: 'gemini-2.5-pro' })
    queue.close()

    const session = {
        path: '/tmp/viby-gemini',
        logPath: '/tmp/viby-gemini/test.log',
        sessionId: null as string | null,
        queue,
        client: {
            rpcHandlerManager: {
                registerHandler() {},
            },
        },
        getPermissionMode() {
            return 'default' as const
        },
        getModel() {
            return 'gemini-2.5-pro'
        },
        onSessionFound(id: string) {
            session.sessionId = id
        },
        setRuntimeStopHandler() {},
        async ensureRemoteBridge() {
            return {
                server: { stop: vi.fn() },
                mcpServers: {},
            }
        },
        async ensureRemoteBackend() {
            return harness.backend
        },
        getRemoteBackend() {
            return harness.backend
        },
        sendSessionEvent(event: Record<string, unknown>) {
            harness.sessionEvents.push(event)
        },
        sendCodexMessage() {},
        onThinkingChange() {},
    }

    return session
}

describe('geminiRemoteLauncher terminal settlement', () => {
    afterEach(() => {
        harness.sessionEvents = []
        harness.backend.initialize.mockClear()
        harness.backend.newSession.mockClear()
        harness.backend.loadSession.mockClear()
        harness.backend.setSessionModel.mockClear()
        harness.backend.prompt.mockReset()
        harness.backend.prompt.mockImplementation(async () => {
            throw new Error('provider unavailable')
        })
        harness.backend.disconnect.mockClear()
        harness.backend.cancelPrompt.mockClear()
        harness.backend.onStderrError.mockClear()
    })

    it('surfaces the concrete Gemini failure and still emits ready after the turn settles', async () => {
        const session = createSessionStub()

        const exitReason = await geminiRemoteLauncher(session as never, {
            model: 'gemini-2.5-pro',
        })

        expect(exitReason).toBe('exit')
        expect(harness.sessionEvents).toContainEqual({
            type: 'message',
            message: 'Gemini prompt failed: provider unavailable',
        })
        expect(harness.sessionEvents).toContainEqual({
            type: 'ready',
        })
    })
})
