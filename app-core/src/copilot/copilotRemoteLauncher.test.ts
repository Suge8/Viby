import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'

const harness = vi.hoisted(() => ({
    sessionEvents: [] as Array<Record<string, unknown>>,
    thinkingChanges: [] as boolean[],
    rpcHandlers: new Map<string, (params: unknown) => unknown>(),
    sdkSession: {
        on: vi.fn(() => vi.fn()),
        send: vi.fn(async () => {
            throw new Error('provider unavailable')
        }),
        abort: vi.fn(async () => {}),
    },
}))

vi.mock('react', () => ({
    default: {
        createElement: vi.fn(() => null),
    },
}))

vi.mock('@github/copilot-sdk', () => ({
    CopilotClient: class {
        async start() {}
        async stop() {}
    },
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        warn: vi.fn(),
        debug: vi.fn(),
    },
}))

vi.mock('./copilotSessionLifecycle', () => ({
    attachCopilotSdkSession: vi.fn(async () => harness.sdkSession),
    disconnectCopilotSdkSession: vi.fn(async () => {}),
    isCopilotSessionMissingError: vi.fn(() => false),
}))

vi.mock('./utils/permissionHandler', () => ({
    CopilotPermissionHandler: class {
        buildHandler() {
            return vi.fn()
        }
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

import { copilotRemoteLauncher } from './copilotRemoteLauncher'

function createSessionStub() {
    const queue = new MessageQueue2<{ permissionMode: 'default' }>((mode) => JSON.stringify(mode))
    queue.push('hello', { permissionMode: 'default' })
    queue.close()

    return {
        path: '/tmp/viby-copilot',
        logPath: '/tmp/viby-copilot/test.log',
        sessionId: null as string | null,
        queue,
        client: {
            rpcHandlerManager: {
                registerHandler(method: string, handler: (params: unknown) => unknown) {
                    harness.rpcHandlers.set(method, handler)
                },
            },
        },
        setRuntimeStopHandler() {},
        onSessionFound(id: string) {
            this.sessionId = id
        },
        sendCodexMessage() {},
        sendSessionEvent(event: Record<string, unknown>) {
            harness.sessionEvents.push(event)
        },
        onThinkingChange(nextThinking: boolean) {
            harness.thinkingChanges.push(nextThinking)
        },
    }
}

describe('copilotRemoteLauncher', () => {
    afterEach(() => {
        harness.sessionEvents = []
        harness.thinkingChanges = []
        harness.rpcHandlers.clear()
        harness.sdkSession.on.mockClear()
        harness.sdkSession.send.mockReset()
        harness.sdkSession.send.mockImplementation(async () => {
            throw new Error('provider unavailable')
        })
    })

    it('surfaces the concrete Copilot failure and still emits ready after the turn settles', async () => {
        const session = createSessionStub()

        const exitReason = await copilotRemoteLauncher(session as never)

        expect(exitReason).toBe('exit')
        expect(harness.sessionEvents).toContainEqual({
            type: 'message',
            message: 'Copilot failed: provider unavailable',
        })
        expect(harness.sessionEvents).toContainEqual({
            type: 'ready',
        })
        expect(harness.thinkingChanges).toContain(true)
        expect(harness.thinkingChanges).toContain(false)
    })
})
