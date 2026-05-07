import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    cleanupAndExit: vi.fn(async () => {}),
    killSessionHandler: null as null | (() => Promise<unknown> | unknown),
    abortCalls: 0,
    stopCalls: 0,
    rpcClientOptions: [] as Array<Record<string, unknown>>,
}))

vi.mock('./piRpcClient', () => ({
    resolvePiExecutable: () => 'pi',
    PiRpcClient: class {
        constructor(options: Record<string, unknown>) {
            harness.rpcClientOptions.push(options)
        }
        async start(): Promise<void> {}
        async getAvailableModels(): Promise<unknown[]> {
            return [{ provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', reasoning: true }]
        }
        async getState(): Promise<unknown> {
            return {
                model: { provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', reasoning: true },
                thinkingLevel: 'off',
                isStreaming: false,
                sessionId: 'pi-session',
            }
        }
        async setModel(): Promise<void> {}
        async setThinkingLevel(): Promise<void> {}
        async abort(): Promise<void> {
            harness.abortCalls += 1
        }
        async stop(): Promise<void> {
            harness.stopCalls += 1
        }
        onEvent(): () => void {
            return () => {}
        }
    },
}))

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: async () => ({
        api: {},
        session: {
            rpcHandlerManager: { registerHandler() {} },
            onUserMessage() {},
        },
    }),
}))

vi.mock('@/agent/runnerLifecycle', () => ({
    createRunnerLifecycle: () => ({
        registerProcessHandlers() {},
        markCrash() {},
        cleanupAndExit: harness.cleanupAndExit,
    }),
    setControlledByUser() {},
}))

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler(_rpcHandlerManager: unknown, handler: () => Promise<unknown> | unknown) {
        harness.killSessionHandler = handler
    },
}))

vi.mock('@/utils/invokedCwd', () => ({ getInvokedCwd: () => '/tmp/viby-pi' }))
vi.mock('@/ui/logger', () => ({ logger: { debug() {} } }))
vi.mock('@/utils/attachmentFormatter', () => ({ formatMessageWithAttachments: (text: string) => text }))
vi.mock('./runPiSupport', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./runPiSupport')>()),
    recoverPiMessages: async () => [],
    runPiPromptLoop: async () => {},
    subscribeToPiSessionEvents: () => () => {},
}))
vi.mock('./session', () => ({
    PiSession: class {
        stopKeepAlive(): void {}
        onSessionFound(): void {}
        setRuntimeStopHandler(): void {}
        setPermissionMode(): void {}
        setModel(): void {}
        setModelReasoningEffort(): void {}
    },
}))

import { runPi } from './runPi'

describe('runPi', () => {
    beforeEach(() => {
        harness.cleanupAndExit.mockClear()
        harness.killSessionHandler = null
        harness.abortCalls = 0
        harness.stopCalls = 0
        harness.rpcClientOptions = []
    })

    it('runs Pi through the external RPC client lifecycle', async () => {
        await runPi({ startedBy: 'runner' })

        expect(harness.killSessionHandler).toBeTypeOf('function')
        expect(harness.stopCalls).toBe(1)
        expect(harness.cleanupAndExit).toHaveBeenCalledTimes(1)
    })

    it('passes provider-native resume handles into the external Pi RPC client', async () => {
        await runPi({ startedBy: 'runner', resumeSessionId: 'pi-provider-session' })

        expect(harness.rpcClientOptions[0]).toMatchObject({
            cwd: '/tmp/viby-pi',
            command: 'pi',
            resumeSessionId: 'pi-provider-session',
        })
    })

    it('routes killSession to the external Pi RPC abort command', async () => {
        await runPi({ startedBy: 'runner' })
        await expect(harness.killSessionHandler?.()).resolves.toBeUndefined()

        expect(harness.abortCalls).toBe(1)
    })
})
