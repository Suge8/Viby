import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
    let resolveCreateAgentSession: ((value: { session: PiSdkSessionStub }) => void) | null = null
    const createAgentSessionPromise = new Promise<{ session: PiSdkSessionStub }>((resolve) => {
        resolveCreateAgentSession = resolve
    })

    return {
        cleanupAndExit: vi.fn(async () => {}),
        killSessionHandler: null as null | (() => Promise<unknown> | unknown),
        createAgentSessionPromise,
        resolveCreateAgentSession,
        abortCalls: 0,
        disposeCalls: 0,
        permissionCancelCalls: 0,
    }
})

type PiSdkSessionStub = {
    model: string
    thinkingLevel: string
    abort: () => Promise<void>
    dispose: () => void
}

vi.mock('@mariozechner/pi-coding-agent', () => ({
    getAgentDir: () => '/tmp/pi-agent',
    AuthStorage: {
        create: () => ({}),
    },
    ModelRegistry: {
        create: () => ({
            getAvailable: () => [],
        }),
    },
    SettingsManager: {
        create: () => ({
            getEnabledModels: () => [],
        }),
    },
    SessionManager: {
        inMemory: () => ({}),
    },
    DefaultResourceLoader: class {
        async reload(): Promise<void> {}
    },
    createAgentSession: vi.fn(async () => harness.createAgentSessionPromise),
}))

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: async () => ({
        api: {},
        session: {
            rpcHandlerManager: {
                registerHandler() {},
            },
            onUserMessage() {},
        },
    }),
}))

vi.mock('@/agent/runnerLifecycle', () => ({
    createRunnerLifecycle: () => ({
        registerProcessHandlers() {},
        markCrash() {},
        setExitCode() {},
        cleanup: async () => {},
        cleanupAndExit: harness.cleanupAndExit,
    }),
    setControlledByUser() {},
}))

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler(_rpcHandlerManager: unknown, handler: () => Promise<unknown> | unknown) {
        harness.killSessionHandler = handler
    },
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/viby-pi',
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug() {},
    },
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: (text: string) => text,
}))

vi.mock('./launchConfig', () => ({
    normalizePiModelSelection: (model: string | undefined) => model,
    resolvePiModel: () => 'pi-model',
    resolvePiScopedModelContext: () => ({
        effectiveSelectablePiModels: [],
        piModelCapabilities: [],
        scopedPiModels: [],
        scopeEnabled: false,
    }),
}))

vi.mock('./messageCodec', () => ({
    formatPiModel: () => 'pi-model',
    fromPiThinkingLevel: () => null,
    toPiThinkingLevel: () => null,
}))

vi.mock('./runPiSupport', () => ({
    applyModel() {},
    applyThinkingLevel() {},
    bindPermissionGate() {},
    createModeHash: (mode: unknown) => JSON.stringify(mode),
    getRuntimeStateFromPiSession: () => ({
        permissionMode: 'default',
        model: 'pi-model',
        modelReasoningEffort: null,
    }),
    preloadRecoveredMessages() {},
    recoverPiMessages: async () => [],
    registerPiSessionConfigHandler() {},
    runPiPromptLoop: async () => {},
    subscribeToPiSessionEvents: () => () => {},
    syncRuntimeSnapshot() {},
}))

vi.mock('./permissionHandler', () => ({
    PiPermissionHandler: class {
        async cancelAll(): Promise<void> {
            harness.permissionCancelCalls += 1
        }
    },
}))

vi.mock('./session', () => ({
    PiSession: class {
        getPermissionMode(): string {
            return 'default'
        }

        stopKeepAlive(): void {}
    },
}))

vi.mock('./vibyTeamIntegration', () => ({
    buildPiTeamPromptContract: () => null,
    buildPiVibyCustomTools: () => [],
}))

import { runPi } from './runPi'

describe('runPi', () => {
    beforeEach(() => {
        harness.cleanupAndExit.mockClear()
        harness.killSessionHandler = null
        harness.abortCalls = 0
        harness.disposeCalls = 0
        harness.permissionCancelCalls = 0
    })

    it('handles killSession before the Pi SDK session is ready', async () => {
        const runPromise = runPi({ startedBy: 'runner' })

        await vi.waitFor(() => {
            expect(harness.killSessionHandler).toBeTypeOf('function')
        })

        await expect(harness.killSessionHandler?.()).resolves.toBeUndefined()

        harness.resolveCreateAgentSession?.({
            session: {
                model: 'pi-model',
                thinkingLevel: 'default',
                abort: async () => {
                    harness.abortCalls += 1
                },
                dispose: () => {
                    harness.disposeCalls += 1
                },
            },
        })

        await runPromise

        expect(harness.abortCalls).toBeGreaterThanOrEqual(1)
        expect(harness.disposeCalls).toBe(1)
        expect(harness.permissionCancelCalls).toBe(1)
        expect(harness.cleanupAndExit).toHaveBeenCalledTimes(1)
    })
})
