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
            meta?: Record<string, unknown>
        }) => void) | null,
        rpcHandlers,
        queueModes: [] as EnhancedMode[],
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

        harness.onUserMessage({
            content: {
                text: 'ping',
                attachments: []
            },
            ...(harness.nextUserMessageMeta ? { meta: harness.nextUserMessageMeta } : {})
        })

        harness.queueModes = options.messageQueue.queue.map((entry) => entry.mode)
    }
}))

import { runClaude } from './runClaude'

describe('runClaude live session config', () => {
    beforeEach(() => {
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.queueModes = []
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
})
