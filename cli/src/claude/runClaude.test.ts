import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionHandoffSnapshot } from '@viby/protocol/types'
import type { EnhancedMode } from './loop'

const harness = vi.hoisted(() => {
    const rpcHandlers = new Map<string, (payload: unknown) => Promise<unknown> | unknown>()

    return {
        onUserMessage: null as ((message: {
            content: {
                text: string
                attachments: unknown[]
            }
            meta?: Record<string, unknown>
        }) => void) | null,
        rpcHandlers,
        queueModes: [] as EnhancedMode[],
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
        teamContext: undefined as undefined | {
            projectId: string
            sessionRole: 'manager' | 'member'
            managerSessionId: string
            memberRole?: 'planner' | 'architect' | 'implementer' | 'debugger' | 'reviewer' | 'verifier' | 'designer'
            memberRoleId?: string
            memberRoleName?: string
            memberRolePromptExtension?: string | null
            projectStatus: 'active' | 'delivered' | 'archived'
        }
    }
})

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: async () => ({
        api: {},
        session: {
            updateMetadata() {},
            getTeamContextSnapshot() {
                return harness.teamContext
            },
            onUserMessage(handler: typeof harness.onUserMessage) {
                harness.onUserMessage = handler
            },
            rpcHandlerManager: {
                registerHandler(method: string, handler: (payload: unknown) => Promise<unknown> | unknown) {
                    harness.rpcHandlers.set(method, handler)
                }
            }
        },
        sessionInfo: {
            id: 'session-1',
            teamContext: harness.teamContext
        }
    })
}))

vi.mock('@/agent/runnerLifecycle', () => ({
    createModeChangeHandler: () => vi.fn(),
    createRunnerLifecycle: () => ({
        registerProcessHandlers() {},
        markCrash() {},
        setExitCode() {},
        cleanup: async () => {},
        cleanupAndExit: async () => {},
    }),
    setControlledByUser() {}
}))

vi.mock('./registerKillSessionHandler', () => ({
    registerKillSessionHandler() {}
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: (text: string) => text
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/viby-claude-live-model'
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug() {},
        debugLargeJson() {},
        infoDeveloper() {},
        logFilePath: '/tmp/viby-claude.log'
    }
}))

vi.mock('@/ui/doctor', () => ({
    getEnvironmentInfo: () => ({})
}))

vi.mock('@/claude/sdk/metadataExtractor', () => ({
    extractSDKMetadataAsync() {}
}))

vi.mock('@/claude/utils/startVibyServer', () => ({
    startVibyServer: async () => ({
        url: 'http://localhost:0',
        stop() {},
        toolNames: []
    })
}))

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: async () => ({
        port: 0,
        token: 'token',
        stop() {}
    })
}))

vi.mock('@/modules/common/hooks/generateHookSettings', () => ({
    generateHookSettingsFile: () => '/tmp/viby-claude-hook.json',
    cleanupHookSettingsFile() {}
}))

vi.mock('@/parsers/specialCommands', () => ({
    parseSpecialCommand: () => ({ type: 'none' })
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
            }
        }

        options.onSessionReady?.(sessionInstance)

        const applyConfig = harness.rpcHandlers.get('set-session-config')
        if (!applyConfig || !harness.onUserMessage) {
            throw new Error('runClaude test harness was not initialized')
        }

        const result = await applyConfig({
            model: 'opus',
            modelReasoningEffort: 'max'
        })

        expect(result).toEqual({
            applied: {
                permissionMode: 'default',
                model: 'opus',
                modelReasoningEffort: 'max'
            }
        })

        const queuedUserMessages = harness.queuedUserMessages.length > 0
            ? harness.queuedUserMessages
            : [{ text: 'ping', attachments: [], meta: harness.nextUserMessageMeta }]
        for (const queuedUserMessage of queuedUserMessages) {
            harness.onUserMessage({
                content: {
                    text: queuedUserMessage.text,
                    attachments: queuedUserMessage.attachments ?? []
                },
                ...(queuedUserMessage.meta ? { meta: queuedUserMessage.meta } : {})
            })
        }

        harness.queueModes = options.messageQueue.queue.map((entry) => entry.mode)
    }
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
            collaborationMode: 'plan'
        },
        attachments: [
            {
                filename: 'spec.md',
                mimeType: 'text/markdown',
                path: '/repo/project/spec.md',
                size: 42
            }
        ],
        history: [
            {
                id: 'message-1',
                seq: 1,
                createdAt: 1,
                role: 'user',
                text: 'Need the switch to preserve continuity.',
                attachmentPaths: ['/repo/project/spec.md']
            },
            {
                id: 'message-2',
                seq: 2,
                createdAt: 2,
                role: 'assistant',
                text: 'I will continue on the same session after the switch.'
            }
        ]
    }
}

describe('runClaude live session config', () => {
    beforeEach(() => {
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.queueModes = []
        harness.queuedUserMessages = []
        harness.sessionState.permissionMode = 'default'
        harness.sessionState.model = null
        harness.sessionState.modelReasoningEffort = null
        harness.nextUserMessageMeta = undefined
        harness.teamContext = undefined
    })

    it('applies live model and reasoning effort updates to the next queued user message', async () => {
        await runClaude({
            startedBy: 'runner',
            model: 'sonnet',
            modelReasoningEffort: 'high'
        })

        expect(harness.sessionState.model).toBe('opus')
        expect(harness.sessionState.modelReasoningEffort).toBe('max')
        expect(harness.queueModes).toEqual([
            {
                permissionMode: 'default',
                model: 'opus',
                modelReasoningEffort: 'max'
            }
        ])
    })

    it('merges authoritative custom role metadata into Claude appendSystemPrompt', async () => {
        harness.teamContext = {
            projectId: 'project-1',
            sessionRole: 'member',
            managerSessionId: 'manager-session-1',
            memberRole: 'reviewer',
            memberRoleId: 'reviewer-mobile',
            memberRoleName: 'Mobile Reviewer',
            memberRolePromptExtension: 'Prioritize pwa-safe interactions and mobile regressions.',
            projectStatus: 'active'
        }
        harness.nextUserMessageMeta = {
            appendSystemPrompt: 'Prioritize regressions and missing tests.'
        }

        await runClaude({
            startedBy: 'runner',
            model: 'sonnet'
        })

        expect(harness.queueModes).toEqual([
            expect.objectContaining({
                permissionMode: 'default',
                model: 'opus',
                modelReasoningEffort: 'max',
                appendSystemPrompt: expect.stringContaining('role prototype is "reviewer"')
            })
        ])
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('Prioritize regressions and missing tests.')
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('reviewer-mobile')
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('Mobile Reviewer')
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('pwa-safe interactions')
    })

    it('injects driver switch continuity exactly once into the first real Claude turn', async () => {
        harness.queuedUserMessages = [
            { text: 'Continue from the old driver.', attachments: [] },
            { text: 'Second turn should not replay the handoff.', attachments: [] }
        ]

        await runClaude({
            startedBy: 'runner',
            model: 'sonnet',
            driverSwitchHandoff: createDriverSwitchHandoff()
        })

        expect(harness.queueModes).toHaveLength(2)
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('Private continuity handoff for a driver switch inside the same Viby session.')
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('"previousDriver": "codex"')
        expect(harness.queueModes[0]?.appendSystemPrompt).toContain('Need the switch to preserve continuity.')
        expect(harness.queueModes[1]?.appendSystemPrompt ?? '').not.toContain('Private continuity handoff for a driver switch inside the same Viby session.')
    })

    it('rejects an empty first Claude turn after a driver switch instead of replaying stale continuity', async () => {
        harness.queuedUserMessages = [
            { text: '   ', attachments: [] }
        ]

        await expect(runClaude({
            startedBy: 'runner',
            model: 'sonnet',
            driverSwitchHandoff: createDriverSwitchHandoff()
        })).rejects.toThrow('Cannot inject driver switch continuity into an empty first user turn')
    })
})
