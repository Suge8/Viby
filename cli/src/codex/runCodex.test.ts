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
        }) => void) | null,
        rpcHandlers,
        queueModes: [] as EnhancedMode[],
        queuedUserMessages: [] as Array<{
            text: string
            attachments?: unknown[]
        }>,
        disposeAppServerClientCalls: 0,
        sessionState: {
            permissionMode: 'default' as EnhancedMode['permissionMode'],
            model: null as string | null,
            modelReasoningEffort: null as EnhancedMode['modelReasoningEffort'],
            collaborationMode: 'default' as EnhancedMode['collaborationMode'],
        },
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

        const queuedUserMessages = harness.queuedUserMessages.length > 0
            ? harness.queuedUserMessages
            : [{ text: 'ping', attachments: [] }]
        for (const queuedUserMessage of queuedUserMessages) {
            harness.onUserMessage({
                content: {
                    text: queuedUserMessage.text,
                    attachments: queuedUserMessage.attachments ?? []
                }
            })
        }

        harness.queueModes = options.messageQueue.queue.map((entry) => entry.mode)
    }
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
            collaborationMode: 'default'
        },
        attachments: [],
        history: [
            {
                id: 'message-1',
                seq: 1,
                createdAt: 1,
                role: 'user',
                text: 'Please keep the same transcript after switching drivers.'
            },
            {
                id: 'message-2',
                seq: 2,
                createdAt: 2,
                role: 'assistant',
                text: 'Continuity should be injected on the next real user turn only.'
            }
        ]
    }
}

describe('runCodex live session config', () => {
    beforeEach(() => {
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.queueModes = []
        harness.queuedUserMessages = []
        harness.disposeAppServerClientCalls = 0
        harness.sessionState.permissionMode = 'default'
        harness.sessionState.model = null
        harness.sessionState.modelReasoningEffort = null
        harness.sessionState.collaborationMode = 'default'
        harness.teamContext = undefined
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

    it('passes authoritative custom role metadata into Codex developer instructions', async () => {
        harness.teamContext = {
            projectId: 'project-1',
            sessionRole: 'member',
            managerSessionId: 'manager-session-1',
            memberRole: 'debugger',
            memberRoleId: 'debugger-root-cause',
            memberRoleName: 'Root Cause Debugger',
            memberRolePromptExtension: 'Always reproduce the failing path before proposing a fix.',
            projectStatus: 'active'
        }

        await runCodex({
            startedBy: 'runner',
            model: 'gpt-5.4-mini'
        })

        expect(harness.queueModes).toHaveLength(1)
        expect(harness.queueModes[0]).toMatchObject({
            permissionMode: 'default',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'default'
        })
        expect(harness.queueModes[0]?.developerInstructions).toContain('role prototype is "debugger"')
        expect(harness.queueModes[0]?.developerInstructions).toContain('debugger-root-cause')
        expect(harness.queueModes[0]?.developerInstructions).toContain('Root Cause Debugger')
        expect(harness.queueModes[0]?.developerInstructions).toContain('reproduce the failing path')
    })

    it('injects driver switch continuity exactly once into the first Codex turn payload', async () => {
        harness.queuedUserMessages = [
            { text: 'Continue from Claude on this same session.', attachments: [] },
            { text: 'Do not replay the handoff here.', attachments: [] }
        ]

        await runCodex({
            startedBy: 'runner',
            model: 'gpt-5.4-mini',
            driverSwitchHandoff: createDriverSwitchHandoff()
        })

        expect(harness.queueModes).toHaveLength(2)
        expect(harness.queueModes[0]).toMatchObject({
            permissionMode: 'default',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'default'
        })
        expect(harness.queueModes[0]?.developerInstructions).toContain('Private continuity handoff for a driver switch inside the same Viby session.')
        expect(harness.queueModes[0]?.developerInstructions).toContain('"previousDriver": "claude"')
        expect(harness.queueModes[0]?.developerInstructions).toContain('Please keep the same transcript after switching drivers.')
        expect(harness.queueModes[1]?.developerInstructions).toBeUndefined()
    })

    it('rejects an empty first Codex turn after a driver switch instead of replaying stale continuity', async () => {
        harness.queuedUserMessages = [
            { text: '   ', attachments: [] }
        ]

        await expect(runCodex({
            startedBy: 'runner',
            model: 'gpt-5.4-mini',
            driverSwitchHandoff: createDriverSwitchHandoff()
        })).rejects.toThrow('Cannot inject driver switch continuity into an empty first user turn')
    })
})
