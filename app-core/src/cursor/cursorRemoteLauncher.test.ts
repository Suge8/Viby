import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'

const harness = vi.hoisted(() => ({
    spawnError: new Error('provider unavailable'),
    spawnExitCode: null as number | null,
    spawnSignal: null as NodeJS.Signals | null,
    sessionEvents: [] as Array<Record<string, unknown>>,
    thinkingChanges: [] as boolean[],
    rpcHandlers: new Map<string, (params: unknown) => unknown>(),
}))

vi.mock('react', () => ({
    default: {
        createElement: vi.fn(() => null),
    },
}))

vi.mock('node:child_process', () => ({
    spawn: vi.fn(() => {
        const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter
            stderr: EventEmitter
            kill: ReturnType<typeof vi.fn>
        }
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = vi.fn()
        queueMicrotask(() => {
            if (harness.spawnSignal !== null) {
                child.emit('exit', null, harness.spawnSignal)
                return
            }
            if (harness.spawnExitCode !== null) {
                child.emit('exit', harness.spawnExitCode, null)
                return
            }
            child.emit('error', harness.spawnError)
        })
        return child
    }),
}))

vi.mock('node:readline', () => ({
    createInterface: vi.fn(() => ({
        on: vi.fn(),
    })),
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
        mcpServers: { viby: {} },
    })),
}))

vi.mock('./utils/cursorConfig', () => ({
    ensureCursorConfig: vi.fn(() => ({ configDir: '/tmp/cursor-config' })),
    buildCursorProcessEnv: vi.fn(() => ({})),
}))

vi.mock('./utils/cursorAgentCommand', () => ({
    getDefaultCursorAgentCommand: vi.fn(() => 'cursor-agent'),
}))

vi.mock('./utils/cursorEventConverter', () => ({
    convertCursorEventToAgentMessage: vi.fn(() => null),
    parseCursorEvent: vi.fn(() => null),
}))

vi.mock('@/agent/messageConverter', () => ({
    convertAgentMessage: vi.fn(() => null),
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

import { cursorRemoteLauncher } from './cursorRemoteLauncher'

function createSessionStub() {
    const queue = new MessageQueue2<{ permissionMode: 'default' }>((mode) => JSON.stringify(mode))
    queue.push('hello', { permissionMode: 'default' })
    queue.close()

    return {
        path: '/tmp/viby-cursor',
        logPath: '/tmp/viby-cursor/test.log',
        sessionId: null as string | null,
        queue,
        client: {
            sessionId: 'session-1',
            rpcHandlerManager: {
                registerHandler(method: string, handler: (params: unknown) => unknown) {
                    harness.rpcHandlers.set(method, handler)
                },
            },
        },
        setRuntimeStopHandler() {},
        async ensureRemoteBridge() {
            return {
                server: { stop: vi.fn() },
                mcpServers: { viby: {} },
            }
        },
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

describe('cursorRemoteLauncher', () => {
    afterEach(() => {
        harness.spawnError = new Error('provider unavailable')
        harness.spawnExitCode = null
        harness.spawnSignal = null
        harness.sessionEvents = []
        harness.thinkingChanges = []
        harness.rpcHandlers.clear()
    })

    it('surfaces the concrete Cursor failure and still emits ready after the turn settles', async () => {
        const session = createSessionStub()

        const exitReason = await cursorRemoteLauncher(session as never)

        expect(exitReason).toBe('exit')
        expect(harness.sessionEvents).toContainEqual({
            type: 'message',
            message: 'Cursor Agent failed: provider unavailable',
        })
        expect(harness.sessionEvents).toContainEqual({
            type: 'ready',
        })
        expect(harness.thinkingChanges).toContain(true)
        expect(harness.thinkingChanges).toContain(false)
    })

    it('surfaces a non-zero Cursor exit code durably before returning to ready', async () => {
        harness.spawnExitCode = 1
        const session = createSessionStub()

        const exitReason = await cursorRemoteLauncher(session as never)

        expect(exitReason).toBe('exit')
        expect(harness.sessionEvents).toContainEqual({
            type: 'message',
            message: 'Cursor Agent failed: exited with code 1',
        })
        expect(harness.sessionEvents).toContainEqual({
            type: 'ready',
        })
    })

    it('surfaces a signal-based Cursor exit durably before returning to ready', async () => {
        harness.spawnSignal = 'SIGTERM'
        const session = createSessionStub()

        const exitReason = await cursorRemoteLauncher(session as never)

        expect(exitReason).toBe('exit')
        expect(harness.sessionEvents).toContainEqual({
            type: 'message',
            message: 'Cursor Agent failed: terminated by signal SIGTERM',
        })
        expect(harness.sessionEvents).toContainEqual({
            type: 'ready',
        })
    })
})
