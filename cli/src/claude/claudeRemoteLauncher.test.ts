import { afterEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    claudeRemote: vi.fn(),
    readyEmitNowCalls: 0,
    readyEmitDetachedCalls: 0,
}))

vi.mock('react', () => ({
    default: {
        createElement: vi.fn(() => null),
    },
}))

vi.mock('./claudeRemote', () => ({
    claudeRemote: harness.claudeRemote,
}))

vi.mock('./utils/permissionHandler', () => ({
    PermissionHandler: class {
        setOnPermissionRequest() {}
        handleModeChange() {}
        handleToolCall = vi.fn()
        isAborted() {
            return false
        }
        onMessage() {}
        getResponses() {
            return new Map()
        }
        reset() {}
    },
}))

vi.mock('./sdk', () => ({
    SDKAssistantMessage: class {},
    SDKMessage: class {},
    SDKUserMessage: class {},
}))

vi.mock('@/ui/messageFormatterInk', () => ({
    formatClaudeMessageForInk: vi.fn(),
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

vi.mock('./utils/sdkToLogConverter', () => ({
    SDKToLogConverter: class {
        updateSessionId() {}
        resetParentChain() {}
        convert() {
            return null
        }
        convertSidechainUserMessage() {
            return null
        }
        generateInterruptedToolResult() {
            return null
        }
    },
}))

vi.mock('./sdk/prompts', () => ({
    PLAN_FAKE_REJECT: 'PLAN_FAKE_REJECT',
}))

vi.mock('./utils/OutgoingMessageQueue', () => ({
    OutgoingMessageQueue: class {
        enqueue() {}
        releaseToolCall() {}
        async flush() {}
        destroy() {}
    },
}))

vi.mock('./claudeRemoteMessageFlow', () => ({
    ClaudeRemoteMessageFlow: class {
        handle() {}
        flushDanglingAssistantStream() {}
        flushInterruptedToolCalls() {}
    },
}))

vi.mock('@/agent/readyEventScheduler', () => ({
    createReadyEventScheduler: vi.fn(() => ({
        emitNow: vi.fn(async () => {
            harness.readyEmitNowCalls += 1
            return true
        }),
        emitDetached: vi.fn(() => {
            harness.readyEmitDetachedCalls += 1
        }),
        schedule: vi.fn(),
        isScheduled: vi.fn(() => false),
        cancel: vi.fn(),
        dispose: vi.fn(),
    })),
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

        protected setupAbortHandlers() {}
    },
}))

import { ClaudeRemoteLauncher, flushClaudeRemotePendingOutput } from './claudeRemoteLauncher'

describe('ClaudeRemoteLauncher', () => {
    afterEach(() => {
        harness.claudeRemote.mockReset()
        harness.readyEmitNowCalls = 0
        harness.readyEmitDetachedCalls = 0
    })

    it('drops thinking immediately and clears the queued prompt when abort is requested', async () => {
        const queueReset = vi.fn()
        const onThinkingChange = vi.fn()

        const session = {
            logPath: '/tmp/viby-claude.log',
            queue: {
                reset: queueReset,
            },
            onThinkingChange,
            client: {},
            setRuntimeStopHandler() {},
            addSessionFoundCallback() {},
            removeSessionFoundCallback() {},
        }

        const launcher = new ClaudeRemoteLauncher(session as never)
        ;(launcher as any).abortController = new AbortController()
        ;(launcher as any).abortFuture = {
            promise: Promise.resolve(),
        }

        await (launcher as any).handleAbortRequest()

        expect(queueReset).toHaveBeenCalledTimes(1)
        expect(onThinkingChange).toHaveBeenCalledWith(false)
        expect((launcher as any).abortController.signal.aborted).toBe(true)
    })

    it('flushes queued Claude output before clearing a dangling assistant stream', async () => {
        const steps: string[] = []
        const messageQueue = {
            async flush() {
                steps.push('flush')
            },
            destroy() {
                steps.push('destroy')
            },
        }
        const messageFlow = {
            flushDanglingAssistantStream() {
                steps.push('clear-stream')
            },
        }

        await flushClaudeRemotePendingOutput(messageQueue, messageFlow)

        expect(steps).toEqual(['flush', 'clear-stream', 'destroy'])
    })

    it('emits ready after a terminal Claude failure settles the turn', async () => {
        let launcher: ClaudeRemoteLauncher
        let waitCalls = 0
        const sendSessionEvent = vi.fn()
        const session = {
            sessionId: 'session-1',
            path: '/tmp/viby-claude',
            logPath: '/tmp/viby-claude.log',
            queue: {
                reset: vi.fn(),
                size: vi.fn(() => 0),
                async waitForMessagesAndGetAsString() {
                    waitCalls += 1
                    if (waitCalls === 1) {
                        return {
                            message: 'hello',
                            mode: { permissionMode: 'default' },
                            hash: 'hash-1',
                            isolate: false,
                        }
                    }
                    ;(launcher as unknown as { exitReason: 'exit' }).exitReason = 'exit'
                    return null
                },
            },
            onThinkingChange: vi.fn(),
            client: {
                rpcHandlerManager: {},
                sendClaudeSessionMessage: vi.fn(),
                sendSessionEvent,
            },
            setRuntimeStopHandler() {},
            addSessionFoundCallback() {},
            removeSessionFoundCallback() {},
        }

        harness.claudeRemote
            .mockImplementationOnce(async ({ nextMessage }: { nextMessage: () => Promise<unknown> }) => {
                await nextMessage()
                throw new Error('API Error: 402 balance required')
            })
            .mockImplementationOnce(async ({ nextMessage }: { nextMessage: () => Promise<unknown> }) => {
                await nextMessage()
            })

        launcher = new ClaudeRemoteLauncher(session as never)

        await (launcher as unknown as { runMainLoop: () => Promise<void> }).runMainLoop()

        expect(sendSessionEvent).toHaveBeenCalledWith({
            type: 'message',
            message: 'API Error: 402 balance required',
        })
        expect(harness.readyEmitNowCalls).toBe(1)
        expect(harness.readyEmitDetachedCalls).toBe(0)
    })

    it('emits ready when Claude returns without an explicit ready callback', async () => {
        let launcher: ClaudeRemoteLauncher
        let waitCalls = 0
        const session = {
            sessionId: 'session-1',
            path: '/tmp/viby-claude',
            logPath: '/tmp/viby-claude.log',
            queue: {
                reset: vi.fn(),
                size: vi.fn(() => 0),
                async waitForMessagesAndGetAsString() {
                    waitCalls += 1
                    if (waitCalls === 1) {
                        return {
                            message: '/clear',
                            mode: { permissionMode: 'default' },
                            hash: 'hash-1',
                            isolate: false,
                        }
                    }
                    ;(launcher as unknown as { exitReason: 'exit' }).exitReason = 'exit'
                    return null
                },
            },
            onThinkingChange: vi.fn(),
            client: {
                rpcHandlerManager: {},
                sendClaudeSessionMessage: vi.fn(),
                sendSessionEvent: vi.fn(),
            },
            setRuntimeStopHandler() {},
            addSessionFoundCallback() {},
            removeSessionFoundCallback() {},
        }

        harness.claudeRemote
            .mockImplementationOnce(async ({ nextMessage }: { nextMessage: () => Promise<unknown> }) => {
                await nextMessage()
            })
            .mockImplementationOnce(async ({ nextMessage }: { nextMessage: () => Promise<unknown> }) => {
                await nextMessage()
            })

        launcher = new ClaudeRemoteLauncher(session as never)

        await (launcher as unknown as { runMainLoop: () => Promise<void> }).runMainLoop()

        expect(harness.readyEmitNowCalls).toBe(1)
        expect(harness.readyEmitDetachedCalls).toBe(0)
    })
})
