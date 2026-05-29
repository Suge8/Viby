import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    cleanupAndExit: vi.fn(async () => {}),
    killSessionHandler: null as null | (() => Promise<unknown> | unknown),
    abortCalls: 0,
    stopCalls: 0,
    failModelCatalog: false,
    bootstrapPayloads: [] as Array<Record<string, unknown>>,
    rpcClientOptions: [] as Array<Record<string, unknown>>,
    rpcCalls: [] as string[],
    setModelCalls: [] as unknown[],
    setThinkingLevelCalls: [] as unknown[],
    piState: {
        model: { provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', reasoning: true },
        thinkingLevel: 'off',
        isStreaming: false,
        sessionId: 'pi-session',
    },
    sessionRuntimeSnapshots: [] as Array<Record<string, unknown>>,
}))

vi.mock('./piRpcClient', () => ({
    resolvePiExecutable: () => 'pi',
    PiRpcClient: class {
        constructor(options: Record<string, unknown>) {
            harness.rpcClientOptions.push(options)
        }
        async start(): Promise<void> {}
        async getAvailableModels(): Promise<unknown[]> {
            harness.rpcCalls.push('models:start')
            await Promise.resolve()
            if (harness.failModelCatalog) {
                throw new Error('Pi RPC get_available_models timed out')
            }
            harness.rpcCalls.push(`models:saw-state:${harness.rpcCalls.includes('state:start')}`)
            return [{ provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', reasoning: true }]
        }
        async getState(): Promise<unknown> {
            harness.rpcCalls.push('state:start')
            return harness.piState
        }
        async setModel(model: unknown): Promise<void> {
            harness.setModelCalls.push(model)
            harness.piState = { ...harness.piState, model: model as typeof harness.piState.model }
        }
        async setThinkingLevel(thinkingLevel: unknown): Promise<void> {
            harness.setThinkingLevelCalls.push(thinkingLevel)
            harness.piState = { ...harness.piState, thinkingLevel: thinkingLevel as string }
        }
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
    bootstrapSession: async (payload: Record<string, unknown>) => {
        harness.bootstrapPayloads.push(payload)
        return {
            api: {},
            session: {
                rpcHandlerManager: { registerHandler() {} },
                onUserMessage() {},
            },
        }
    },
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
        private snapshot: Record<string, unknown> = {}
        stopKeepAlive(): void {}
        onSessionFound(): void {}
        setRuntimeStopHandler(): void {}
        setPermissionMode(permissionMode: unknown): void {
            this.snapshot.permissionMode = permissionMode
            harness.sessionRuntimeSnapshots.push({ ...this.snapshot })
        }
        setModel(model: unknown): void {
            this.snapshot.model = model
            harness.sessionRuntimeSnapshots.push({ ...this.snapshot })
        }
        setModelReasoningEffort(modelReasoningEffort: unknown): void {
            this.snapshot.modelReasoningEffort = modelReasoningEffort
            harness.sessionRuntimeSnapshots.push({ ...this.snapshot })
        }
    },
}))

import { runPi } from './runPi'

describe('runPi', () => {
    beforeEach(() => {
        harness.cleanupAndExit.mockClear()
        harness.killSessionHandler = null
        harness.abortCalls = 0
        harness.stopCalls = 0
        harness.failModelCatalog = false
        harness.bootstrapPayloads = []
        harness.rpcClientOptions = []
        harness.rpcCalls = []
        harness.setModelCalls = []
        harness.setThinkingLevelCalls = []
        harness.piState = {
            model: { provider: 'openai-codex', id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', reasoning: true },
            thinkingLevel: 'off',
            isStreaming: false,
            sessionId: 'pi-session',
        }
        harness.sessionRuntimeSnapshots = []
    })

    it('runs Pi through the external RPC client lifecycle', async () => {
        await runPi({ startedBy: 'runner' })

        expect(harness.killSessionHandler).toBeTypeOf('function')
        expect(harness.stopCalls).toBe(1)
        expect(harness.cleanupAndExit).toHaveBeenCalledTimes(1)
    })

    it('loads Pi state before the non-blocking model catalog', async () => {
        await runPi({ startedBy: 'runner' })

        expect(harness.rpcCalls.slice(0, 3)).toEqual(['state:start', 'models:start', 'models:saw-state:true'])
    })

    it('continues startup with the current model when Pi model catalog loading times out', async () => {
        harness.failModelCatalog = true

        await runPi({ startedBy: 'runner' })

        expect(harness.bootstrapPayloads[0]).toMatchObject({
            model: 'openai-codex/gpt-5.4-mini',
            metadataOverrides: {
                piModelScope: {
                    models: [
                        {
                            id: 'openai-codex/gpt-5.4-mini',
                            label: 'GPT-5.4 Mini',
                        },
                    ],
                },
            },
        })
        expect(harness.setModelCalls[0]).toMatchObject({
            provider: 'openai-codex',
            id: 'gpt-5.4-mini',
        })
    })

    it('applies requested startup reasoning before syncing the session snapshot', async () => {
        harness.piState = { ...harness.piState, thinkingLevel: 'xhigh' }

        await runPi({ startedBy: 'runner', modelReasoningEffort: 'medium' })

        expect(harness.setThinkingLevelCalls).toEqual(['medium'])
        expect(harness.sessionRuntimeSnapshots.at(-1)).toMatchObject({ modelReasoningEffort: 'medium' })
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
