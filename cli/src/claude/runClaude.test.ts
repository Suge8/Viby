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
                  meta?: Record<string, unknown>
              }) => void)
            | null,
        rpcHandlers,
        queueModes: [] as EnhancedMode[],
        killSessionHandler: null as null | (() => Promise<unknown> | unknown),
        cleanupAndExit: vi.fn(async () => {}),
        requestRuntimeStop: vi.fn(async () => true),
        queuedUserMessages: [] as Array<{
            text: string
            attachments?: unknown[]
            meta?: Record<string, unknown>
        }>,
        sessionState: {
            permissionMode: 'default' as EnhancedMode['permissionMode'],
            model: null as string | null,
            modelReasoningEffort: null as EnhancedMode['modelReasoningEffort'],
        },
        nextUserMessageMeta: undefined as Record<string, unknown> | undefined,
    }
})

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: async (options: Record<string, unknown>) => {
        harness.bootstrapArgs.push(options)
        return {
            api: {},
            session: {
                updateMetadata() {},
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
    createRunnerLifecycle: () => ({
        registerProcessHandlers() {},
        markCrash() {},
        setExitCode() {},
        cleanup: async () => {},
        cleanupAndExit: harness.cleanupAndExit,
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

vi.mock('./registerKillSessionHandler', () => ({
    registerKillSessionHandler(_rpcHandlerManager: unknown, handler: () => Promise<unknown> | unknown) {
        harness.killSessionHandler = handler
    },
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: (text: string) => text,
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/viby-claude-live-model',
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug() {},
        debugLargeJson() {},
        infoDeveloper() {},
        logFilePath: '/tmp/viby-claude.log',
    },
}))

vi.mock('@/ui/doctor', () => ({
    getEnvironmentInfo: () => ({}),
}))

vi.mock('@/claude/sdk/metadataExtractor', () => ({
    extractSDKMetadataAsync() {},
}))

vi.mock('@/claude/utils/startVibyServer', () => ({
    startVibyServer: async () => ({
        url: 'http://localhost:0',
        stop() {},
        toolNames: [],
    }),
}))

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: async () => ({
        port: 0,
        token: 'token',
        stop() {},
    }),
}))

vi.mock('@/modules/common/hooks/generateHookSettings', () => ({
    generateHookSettingsFile: () => '/tmp/viby-claude-hook.json',
    cleanupHookSettingsFile() {},
}))

vi.mock('@/parsers/specialCommands', () => ({
    parseSpecialCommand: () => ({ type: 'none' }),
}))

vi.mock('./loop', () => ({
    loop: async (options: {
        messageQueue: {
            queue: Array<{ mode: EnhancedMode }>
        }
        onSessionReady?: (session: {
            stopKeepAlive(): void
            getPermissionMode(): EnhancedMode['permissionMode']
            setPermissionMode(mode: EnhancedMode['permissionMode']): void
            getModel(): string | null
            setModel(model: string | null): void
            getModelReasoningEffort(): EnhancedMode['modelReasoningEffort']
            setModelReasoningEffort(modelReasoningEffort: EnhancedMode['modelReasoningEffort']): void
        }) => void
    }) => {
        const sessionInstance = {
            stopKeepAlive() {},
            requestRuntimeStop: harness.requestRuntimeStop,
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
        }

        options.onSessionReady?.(sessionInstance)

        const applyConfig = harness.rpcHandlers.get('set-session-config')
        if (!applyConfig || !harness.onUserMessage) {
            throw new Error('runClaude test harness was not initialized')
        }

        const result = await applyConfig({
            model: 'opus',
            modelReasoningEffort: 'max',
        })

        expect(result).toEqual({
            applied: {
                permissionMode: 'default',
                model: 'opus',
                modelReasoningEffort: 'max',
            },
        })

        const queuedUserMessages =
            harness.queuedUserMessages.length > 0
                ? harness.queuedUserMessages
                : [{ text: 'ping', attachments: [], meta: harness.nextUserMessageMeta }]
        for (const queuedUserMessage of queuedUserMessages) {
            harness.onUserMessage({
                content: {
                    text: queuedUserMessage.text,
                    attachments: queuedUserMessage.attachments ?? [],
                },
                ...(queuedUserMessage.meta ? { meta: queuedUserMessage.meta } : {}),
            })
        }

        harness.queueModes = options.messageQueue.queue.map((entry) => entry.mode)
    },
}))

import { runClaude } from './runClaude'

function createDriverSwitchHandoff(): SessionHandoffSnapshot {
    return {
        driver: 'codex',
        workingDirectory: '/repo/project',
        liveConfig: {
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'safe-yolo',
            collaborationMode: 'plan',
        },
        attachments: [
            {
                filename: 'spec.md',
                mimeType: 'text/markdown',
                path: '/repo/project/spec.md',
                size: 42,
            },
        ],
        history: [
            {
                id: 'message-1',
                seq: 1,
                createdAt: 1,
                role: 'user',
                text: 'Need the switch to preserve continuity.',
                attachmentPaths: ['/repo/project/spec.md'],
            },
            {
                id: 'message-2',
                seq: 2,
                createdAt: 2,
                role: 'assistant',
                text: 'I will continue on the same session after the switch.',
            },
        ],
    }
}

describe('runClaude live session config', () => {
    beforeEach(() => {
        harness.bootstrapArgs.length = 0
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.queueModes = []
        harness.killSessionHandler = null
        harness.cleanupAndExit.mockClear()
        harness.queuedUserMessages = []
        harness.requestRuntimeStop.mockClear()
        harness.sessionState.permissionMode = 'default'
        harness.sessionState.model = null
        harness.sessionState.modelReasoningEffort = null
        harness.nextUserMessageMeta = undefined
    })

    it('applies live model and reasoning effort updates to the next queued user message', async () => {
        await runClaude({
            startedBy: 'runner',
            model: 'sonnet',
            modelReasoningEffort: 'high',
        })

        expect(harness.sessionState.model).toBe('opus')
        expect(harness.sessionState.modelReasoningEffort).toBe('max')
        expect(harness.queueModes).toEqual([
            {
                permissionMode: 'default',
                model: 'opus',
                modelReasoningEffort: 'max',
            },
        ])
    })

    it('injects driver switch continuity exactly once into the first real Claude turn', async () => {
        harness.queuedUserMessages = [
            { text: 'Continue from the old driver.', attachments: [] },
            { text: 'Second turn should not replay the handoff.', attachments: [] },
        ]

        await runClaude({
            startedBy: 'runner',
            model: 'sonnet',
            driverSwitchBootstrap: true,
            sessionContinuityHandoff: createDriverSwitchHandoff(),
        })

        expect(harness.queueModes).toHaveLength(2)
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain(
            'Private continuity handoff for resuming the same Viby session.'
        )
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('"previousDriver": "codex"')
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('Need the switch to preserve continuity.')
        expect(harness.queueModes[1]?.appendSystemPrompt ?? '').not.toContain(
            'Private continuity handoff for resuming the same Viby session.'
        )
        expect(harness.bootstrapArgs[0]?.driverSwitchBootstrap).toBe(true)
    })

    it('rejects an empty first Claude turn after a driver switch instead of replaying stale continuity', async () => {
        harness.queuedUserMessages = [{ text: '   ', attachments: [] }]

        await expect(
            runClaude({
                startedBy: 'runner',
                model: 'sonnet',
                driverSwitchBootstrap: true,
                sessionContinuityHandoff: createDriverSwitchHandoff(),
            })
        ).rejects.toThrow('Cannot inject session continuity into an empty first user turn')
    })

    it('routes killSession through the active runtime stop owner', async () => {
        await runClaude({
            startedBy: 'runner',
            model: 'sonnet',
        })

        const cleanupCallsBeforeKill = harness.cleanupAndExit.mock.calls.length
        await harness.killSessionHandler?.()

        expect(harness.requestRuntimeStop).toHaveBeenCalledTimes(1)
        expect(harness.cleanupAndExit).toHaveBeenCalledTimes(cleanupCallsBeforeKill)
    })
})
