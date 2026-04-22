import type { SessionHandoffSnapshot } from '@viby/protocol/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnhancedMode } from './loop'

const harness = vi.hoisted(() => {
    const rpcHandlers = new Map<string, (payload: unknown) => Promise<unknown> | unknown>()

    return {
        bootstrapArgs: [] as Array<Record<string, unknown>>,
        onUserMessage: null as
            | ((message: {
                  content: {
                      text: string
                      attachments: unknown[]
                  }
              }) => void)
            | null,
        rpcHandlers,
        queueModes: [] as EnhancedMode[],
        queuedUserMessages: [] as Array<{
            text: string
            attachments?: unknown[]
        }>,
        configPayloads: [] as Array<Record<string, unknown>>,
        beforeConfigApply: null as (() => void) | null,
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
    bootstrapSession: async (options: Record<string, unknown>) => {
        harness.bootstrapArgs.push(options)
        return {
            api: {},
            session: {
                onUserMessage(handler: typeof harness.onUserMessage) {
                    harness.onUserMessage = handler
                },
                rpcHandlerManager: {
                    registerHandler(method: string, handler: (payload: unknown) => Promise<unknown> | unknown) {
                        harness.rpcHandlers.set(method, handler)
                    },
                },
            },
            sessionInfo: {
                id: 'session-1',
            },
        }
    },
}))

vi.mock('@/agent/runnerLifecycle', () => ({
    createRunnerLifecycle: (options: { onBeforeClose?: () => Promise<void> | void }) => ({
        registerProcessHandlers() {},
        markCrash() {},
        setExitCode() {},
        cleanup: async () => {
            await options.onBeforeClose?.()
        },
        cleanupAndExit: async () => {
            await options.onBeforeClose?.()
        },
    }),
    createRuntimeStopRequestHandler: (options: {
        getOwner: () => { requestRuntimeStop(): Promise<boolean> } | null | undefined
        cleanupAndExit: () => Promise<void>
    }) => {
        return async () => {
            if (await options.getOwner()?.requestRuntimeStop()) {
                return
            }
            await options.cleanupAndExit()
        }
    },
    setControlledByUser() {},
}))

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler() {},
}))

vi.mock('./utils/codexCliOverrides', () => ({
    parseCodexCliOverrides: () => undefined,
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: (text: string) => text,
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/viby-live-model',
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug() {},
    },
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
            localLaunchFailure: null,
        }

        options.onSessionReady?.(sessionInstance)

        const applyConfig = harness.rpcHandlers.get('set-session-config')
        if (!applyConfig || !harness.onUserMessage) {
            throw new Error('runCodex test harness was not initialized')
        }

        harness.beforeConfigApply?.()

        const configPayloads =
            harness.configPayloads.length > 0
                ? harness.configPayloads
                : [
                      {
                          model: 'gpt-5.4',
                          modelReasoningEffort: 'high',
                      },
                  ]

        for (const payload of configPayloads) {
            await applyConfig(payload)
        }

        const queuedUserMessages =
            harness.queuedUserMessages.length > 0 ? harness.queuedUserMessages : [{ text: 'ping', attachments: [] }]
        for (const queuedUserMessage of queuedUserMessages) {
            harness.onUserMessage({
                content: {
                    text: queuedUserMessage.text,
                    attachments: queuedUserMessage.attachments ?? [],
                },
            })
        }

        harness.queueModes = options.messageQueue.queue.map((entry) => entry.mode)
    },
}))

import { runCodex } from './runCodex'

function createDriverSwitchHandoff(): SessionHandoffSnapshot {
    return {
        driver: 'claude',
        workingDirectory: '/repo/project',
        liveConfig: {
            model: 'sonnet',
            modelReasoningEffort: 'high',
            permissionMode: 'default',
            collaborationMode: 'default',
        },
        attachments: [],
        history: [
            {
                id: 'message-1',
                seq: 1,
                createdAt: 1,
                role: 'user',
                text: 'Please keep the same transcript after switching drivers.',
            },
            {
                id: 'message-2',
                seq: 2,
                createdAt: 2,
                role: 'assistant',
                text: 'Continuity should be injected on the next real user turn only.',
            },
        ],
    }
}

describe('runCodex live session config', () => {
    beforeEach(() => {
        harness.bootstrapArgs.length = 0
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.queueModes = []
        harness.queuedUserMessages = []
        harness.configPayloads = []
        harness.beforeConfigApply = null
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
            modelReasoningEffort: 'low',
        })

        expect(harness.sessionState.model).toBe('gpt-5.4')
        expect(harness.sessionState.modelReasoningEffort).toBe('high')
        expect(harness.queueModes).toEqual([
            {
                permissionMode: 'default',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                collaborationMode: 'default',
            },
        ])
        expect(harness.disposeAppServerClientCalls).toBe(1)
    })

    it('injects driver switch continuity exactly once into the first Codex turn payload', async () => {
        harness.queuedUserMessages = [
            { text: 'Continue from Claude on this same session.', attachments: [] },
            { text: 'Do not replay the handoff here.', attachments: [] },
        ]

        await runCodex({
            startedBy: 'runner',
            model: 'gpt-5.4-mini',
            driverSwitchBootstrap: true,
            sessionContinuityHandoff: createDriverSwitchHandoff(),
        })

        expect(harness.queueModes).toHaveLength(2)
        expect(harness.queueModes[0]).toMatchObject({
            permissionMode: 'default',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'default',
        })
        expect(harness.queueModes[0]?.developerInstructions).toContain(
            'Private continuity handoff for resuming the same Viby session.'
        )
        expect(harness.queueModes[0]?.developerInstructions).toContain('"previousDriver": "claude"')
        expect(harness.queueModes[0]?.developerInstructions).toContain(
            'Please keep the same transcript after switching drivers.'
        )
        expect(harness.queueModes[1]?.developerInstructions).toBeUndefined()
        expect(harness.bootstrapArgs[0]?.driverSwitchBootstrap).toBe(true)
    })

    it('preserves the resolved app-server model when collaboration mode changes before the first user turn', async () => {
        harness.beforeConfigApply = () => {
            harness.sessionState.model = 'gpt-5.4'
        }
        harness.configPayloads = [
            {
                collaborationMode: 'plan',
                modelReasoningEffort: 'medium',
            },
        ]

        await runCodex({
            startedBy: 'runner',
        })

        expect(harness.sessionState.model).toBe('gpt-5.4')
        expect(harness.sessionState.collaborationMode).toBe('plan')
        expect(harness.sessionState.modelReasoningEffort).toBe('medium')
        expect(harness.queueModes).toEqual([
            {
                permissionMode: 'default',
                model: 'gpt-5.4',
                modelReasoningEffort: 'medium',
                collaborationMode: 'plan',
            },
        ])
    })

    it('rejects an empty first Codex turn after a driver switch instead of replaying stale continuity', async () => {
        harness.queuedUserMessages = [{ text: '   ', attachments: [] }]

        await expect(
            runCodex({
                startedBy: 'runner',
                model: 'gpt-5.4-mini',
                driverSwitchBootstrap: true,
                sessionContinuityHandoff: createDriverSwitchHandoff(),
            })
        ).rejects.toThrow('Cannot inject session continuity into an empty first user turn')
    })
})
