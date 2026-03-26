import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnhancedMode } from './loop'

const harness = vi.hoisted(() => {
    const rpcHandlers = new Map<string, (payload: unknown) => Promise<unknown> | unknown>()

    return {
        onUserMessage: null as ((message: {
            content: {
                text: string
                attachments: unknown[]
            }
        }) => void) | null,
        rpcHandlers,
        queueModes: [] as EnhancedMode[],
        disposeAppServerClientCalls: 0,
        sessionState: {
            permissionMode: 'default' as EnhancedMode['permissionMode'],
            model: null as string | null,
            modelReasoningEffort: null as EnhancedMode['modelReasoningEffort'],
            collaborationMode: 'default' as EnhancedMode['collaborationMode'],
        },
    }
})

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: async () => ({
        api: {},
        session: {
            onUserMessage(handler: typeof harness.onUserMessage) {
                harness.onUserMessage = handler
            },
            rpcHandlerManager: {
                registerHandler(method: string, handler: (payload: unknown) => Promise<unknown> | unknown) {
                    harness.rpcHandlers.set(method, handler)
                }
            }
        }
    })
}))

vi.mock('@/agent/runnerLifecycle', () => ({
    createModeChangeHandler: () => vi.fn(),
    createRunnerLifecycle: (options: { onBeforeClose?: () => Promise<void> | void }) => ({
        registerProcessHandlers() {},
        markCrash() {},
        setExitCode() {},
        cleanupAndExit: async () => {
            await options.onBeforeClose?.()
        },
    }),
    setControlledByUser() {}
}))

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler() {}
}))

vi.mock('./utils/codexCliOverrides', () => ({
    parseCodexCliOverrides: () => undefined
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: (text: string) => text
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/viby-live-model'
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug() {},
    }
}))

vi.mock('./loop', () => ({
    loop: async (options: {
        messageQueue: {
            queue: Array<{ mode: EnhancedMode }>
        }
        onSessionReady?: (session: {
            stopKeepAlive(): void
            getPermissionMode(): string
            setPermissionMode(mode: EnhancedMode['permissionMode']): void
            getModel(): string | null
            setModel(model: string | null): void
            getModelReasoningEffort(): EnhancedMode['modelReasoningEffort']
            setModelReasoningEffort(modelReasoningEffort: EnhancedMode['modelReasoningEffort']): void
            getCollaborationMode(): EnhancedMode['collaborationMode']
            setCollaborationMode(mode: EnhancedMode['collaborationMode']): void
            localLaunchFailure: null
        }) => void
    }) => {
        const sessionInstance = {
            stopKeepAlive() {},
            getPermissionMode: () => harness.sessionState.permissionMode,
            setPermissionMode(mode: EnhancedMode['permissionMode']) {
                harness.sessionState.permissionMode = mode
            },
            getModel: () => harness.sessionState.model,
            setModel(model: string | null) {
                harness.sessionState.model = model
            },
            getModelReasoningEffort: () => harness.sessionState.modelReasoningEffort,
            setModelReasoningEffort(modelReasoningEffort: EnhancedMode['modelReasoningEffort']) {
                harness.sessionState.modelReasoningEffort = modelReasoningEffort
            },
            getCollaborationMode: () => harness.sessionState.collaborationMode,
            setCollaborationMode(mode: EnhancedMode['collaborationMode']) {
                harness.sessionState.collaborationMode = mode
            },
            disposeAppServerClient: async () => {
                harness.disposeAppServerClientCalls += 1
            },
            localLaunchFailure: null
        }

        options.onSessionReady?.(sessionInstance)

        const applyConfig = harness.rpcHandlers.get('set-session-config')
        if (!applyConfig || !harness.onUserMessage) {
            throw new Error('runCodex test harness was not initialized')
        }

        const result = await applyConfig({
            model: 'gpt-5.4',
            modelReasoningEffort: 'high'
        })

        expect(result).toEqual({
            applied: {
                permissionMode: 'default',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                collaborationMode: 'default'
            }
        })

        harness.onUserMessage({
            content: {
                text: 'ping',
                attachments: []
            }
        })

        harness.queueModes = options.messageQueue.queue.map((entry) => entry.mode)
    }
}))

import { runCodex } from './runCodex'

describe('runCodex live session config', () => {
    beforeEach(() => {
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.queueModes = []
        harness.disposeAppServerClientCalls = 0
        harness.sessionState.permissionMode = 'default'
        harness.sessionState.model = null
        harness.sessionState.modelReasoningEffort = null
        harness.sessionState.collaborationMode = 'default'
    })

    it('applies live model and reasoning effort updates to the next queued user message', async () => {
        await runCodex({
            startedBy: 'runner',
            model: 'gpt-5.4-mini',
            modelReasoningEffort: 'low'
        })

        expect(harness.sessionState.model).toBe('gpt-5.4')
        expect(harness.sessionState.modelReasoningEffort).toBe('high')
        expect(harness.queueModes).toEqual([
            {
                permissionMode: 'default',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                collaborationMode: 'default'
            }
        ])
        expect(harness.disposeAppServerClientCalls).toBe(1)
    })
})
