import type { SessionHandoffSnapshot } from '@viby/protocol/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    bootstrapArgs: [] as Array<Record<string, unknown>>,
    sessionState: {
        permissionMode: 'default' as string,
        model: null as string | null,
    },
    onUserMessage: null as null | ((message: { content: { text: string; attachments: unknown[] } }) => void),
    rpcHandlers: new Map<string, (payload: unknown) => Promise<unknown>>(),
    queueModes: [] as Array<Record<string, unknown>>,
    queuedUserMessages: [] as Array<{ text: string; attachments?: unknown[] }>,
    geminiLoopArgs: [] as Array<Record<string, unknown>>,
    session: {
        onUserMessage(callback: (message: { content: { text: string; attachments: unknown[] } }) => void) {
            harness.onUserMessage = callback
        },
        rpcHandlerManager: {
            registerHandler(name: string, handler: (payload: unknown) => Promise<unknown>) {
                harness.rpcHandlers.set(name, handler)
            },
        },
    },
}))

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: vi.fn(async (options: Record<string, unknown>) => {
        harness.bootstrapArgs.push(options)
        return {
            api: {},
            session: harness.session,
        }
    }),
}))

vi.mock('./loop', () => ({
    geminiLoop: vi.fn(
        async (
            options: {
                messageQueue: {
                    queue: Array<{ mode: Record<string, unknown> }>
                }
                onSessionReady?: (session: {
                    setPermissionMode(mode: string): void
                    setModel(model: string | null): void
                }) => void
            } & Record<string, unknown>
        ) => {
            harness.geminiLoopArgs.push(options)

            const sessionInstance = {
                stopKeepAlive() {},
                setPermissionMode(mode: string) {
                    harness.sessionState.permissionMode = mode
                },
                setModel(model: string | null) {
                    harness.sessionState.model = model
                },
            }

            options.onSessionReady?.(sessionInstance)

            const applyConfig = harness.rpcHandlers.get('set-session-config')
            if (!applyConfig || !harness.onUserMessage) {
                return
            }

            const result = await applyConfig({
                model: 'gemini-2.5-flash-lite',
            })

            expect(result).toEqual({
                applied: {
                    permissionMode: 'default',
                    model: 'gemini-2.5-flash-lite',
                },
            })

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
        }
    ),
}))

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler: vi.fn(),
}))

vi.mock('@/agent/runtimeLifecycle', () => ({
    createRuntimeLifecycle: vi.fn(() => ({
        registerProcessHandlers: vi.fn(),
        cleanupAndExit: vi.fn(async () => {}),
        markCrash: vi.fn(),
    })),
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
    setControlledByUser: vi.fn(),
}))

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: vi.fn(async () => ({
        port: 1234,
        token: 'token',
        stop: vi.fn(),
    })),
}))

vi.mock('@/modules/common/hooks/generateHookSettings', () => ({
    cleanupHookSettingsFile: vi.fn(),
    generateHookSettingsFile: vi.fn(() => '/tmp/gemini-hooks.json'),
}))

const resolveGeminiRuntimeConfigMock = vi.hoisted(() => vi.fn())

vi.mock('./utils/config', () => ({
    resolveGeminiRuntimeConfig: resolveGeminiRuntimeConfigMock,
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: vi.fn((text: string) => text),
}))

import { runGemini } from './runGemini'

function createSessionContinuityHandoff(): SessionHandoffSnapshot {
    return {
        driver: 'claude',
        workingDirectory: '/repo/project',
        liveConfig: {
            model: 'claude-sonnet',
            modelReasoningEffort: 'high',
            codexServiceTier: null,
            permissionMode: 'default',
            collaborationMode: undefined,
        },
        attachments: [],
        history: [
            {
                id: 'message-1',
                seq: 1,
                createdAt: 1,
                role: 'user',
                text: 'Continue this exact Viby session.',
            },
        ],
    }
}

describe('runGemini live session config', () => {
    beforeEach(() => {
        harness.bootstrapArgs.length = 0
        harness.geminiLoopArgs.length = 0
        harness.queueModes = []
        harness.queuedUserMessages = []
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.sessionState.permissionMode = 'default'
        harness.sessionState.model = null
        resolveGeminiRuntimeConfigMock.mockReset()
    })

    it('persists a resolved local or explicit model before bootstrapping the session', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-3-pro-preview',
            modelSource: 'local',
        })

        await runGemini({})

        expect(harness.bootstrapArgs[0]?.model).toBe('gemini-3-pro-preview')
        expect(harness.geminiLoopArgs[0]?.model).toBe('gemini-3-pro-preview')
    })

    it('keeps terminal default semantics when Gemini runtime config has no explicit model', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: undefined,
            modelSource: 'terminal-default',
        })

        await runGemini({})

        expect(harness.bootstrapArgs[0]?.model).toBeUndefined()
        expect(harness.geminiLoopArgs[0]?.model).toBeUndefined()
    })

    it('forwards resumeSessionId into the Gemini loop', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-2.5-pro',
            modelSource: 'explicit',
        })

        await runGemini({ resumeSessionId: 'gemini-session-123' })

        expect(harness.geminiLoopArgs[0]?.resumeSessionId).toBe('gemini-session-123')
    })

    it('applies live model updates to the next queued user message', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: undefined,
            modelSource: 'terminal-default',
        })

        await runGemini({ startedBy: 'app-core' })

        expect(harness.sessionState.model).toBe('gemini-2.5-flash-lite')
        expect(harness.queueModes).toEqual([
            {
                permissionMode: 'default',
                model: 'gemini-2.5-flash-lite',
            },
        ])
    })

    it('injects session continuity exactly once into the first queued Gemini turn', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-2.5-pro',
            modelSource: 'explicit',
        })
        harness.queuedUserMessages = [
            { text: 'Resume this old session.', attachments: [] },
            { text: 'Do not replay the handoff here.', attachments: [] },
        ]

        await runGemini({
            startedBy: 'app-core',
            driverSwitchBootstrap: true,
            sessionContinuityHandoff: createSessionContinuityHandoff(),
        })

        expect(harness.queueModes).toHaveLength(2)
        expect(harness.queueModes[0]?.developerInstructions).toContain(
            'Private continuity handoff for resuming the same Viby session.'
        )
        expect(harness.queueModes[0]?.developerInstructions).toContain('"previousDriver": "claude"')
        expect(harness.queueModes[1]?.developerInstructions).toBeUndefined()
        expect(harness.bootstrapArgs[0]?.driverSwitchBootstrap).toBe(true)
    })
})
