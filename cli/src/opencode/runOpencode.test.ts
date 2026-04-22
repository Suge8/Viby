import type { SessionHandoffSnapshot } from '@viby/protocol/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpencodeMode } from './types'

const harness = vi.hoisted(() => ({
    bootstrapArgs: [] as Array<Record<string, unknown>>,
    onUserMessage: null as null | ((message: { content: { text: string; attachments: unknown[] } }) => void),
    rpcHandlers: new Map<string, (payload: unknown) => Promise<unknown>>(),
    queueModes: [] as OpencodeMode[],
    queuedUserMessages: [] as Array<{ text: string; attachments?: unknown[] }>,
    loopArgs: [] as Array<Record<string, unknown>>,
    sessionState: {
        permissionMode: 'default' as OpencodeMode['permissionMode'],
    },
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
    opencodeLoop: vi.fn(
        async (
            options: {
                messageQueue: {
                    queue: Array<{ mode: OpencodeMode }>
                }
                onSessionReady?: (session: { setPermissionMode(mode: OpencodeMode['permissionMode']): void }) => void
            } & Record<string, unknown>
        ) => {
            harness.loopArgs.push(options)

            const sessionInstance = {
                stopKeepAlive() {},
                setPermissionMode(mode: OpencodeMode['permissionMode']) {
                    harness.sessionState.permissionMode = mode
                },
                disposeRemoteRuntime: async () => {},
            }

            options.onSessionReady?.(sessionInstance)

            const queuedUserMessages =
                harness.queuedUserMessages.length > 0 ? harness.queuedUserMessages : [{ text: 'ping', attachments: [] }]
            if (!harness.onUserMessage) {
                return
            }
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

vi.mock('@/agent/runnerLifecycle', () => ({
    createRunnerLifecycle: vi.fn(() => ({
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

vi.mock('./utils/startOpencodeHookServer', () => ({
    startOpencodeHookServer: vi.fn(async () => ({
        port: 1234,
        stop: vi.fn(),
    })),
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: vi.fn((text: string) => text),
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: vi.fn(() => '/tmp/viby-opencode'),
}))

import { runOpencode } from './runOpencode'

function createSessionContinuityHandoff(): SessionHandoffSnapshot {
    return {
        driver: 'gemini',
        workingDirectory: '/repo/project',
        liveConfig: {
            model: 'gemini-2.5-pro',
            modelReasoningEffort: null,
            permissionMode: 'default',
            collaborationMode: undefined,
        },
        attachments: [],
        history: [
            {
                id: 'message-1',
                seq: 1,
                createdAt: 1,
                role: 'assistant',
                text: 'Continue the same OpenCode session.',
            },
        ],
    }
}

describe('runOpencode continuity', () => {
    beforeEach(() => {
        harness.bootstrapArgs.length = 0
        harness.loopArgs.length = 0
        harness.queueModes = []
        harness.queuedUserMessages = []
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.sessionState.permissionMode = 'default'
    })

    it('injects session continuity exactly once into the first queued OpenCode turn', async () => {
        harness.queuedUserMessages = [
            { text: 'Resume the closed OpenCode session.', attachments: [] },
            { text: 'Second turn should be clean.', attachments: [] },
        ]

        await runOpencode({
            startedBy: 'runner',
            driverSwitchBootstrap: true,
            sessionContinuityHandoff: createSessionContinuityHandoff(),
        })

        expect(harness.queueModes).toHaveLength(2)
        expect(harness.queueModes[0]?.developerInstructions).toContain(
            'Private continuity handoff for resuming the same Viby session.'
        )
        expect(harness.queueModes[0]?.developerInstructions).toContain('"previousDriver": "gemini"')
        expect(harness.queueModes[1]?.developerInstructions).toBeUndefined()
        expect(harness.bootstrapArgs[0]?.driverSwitchBootstrap).toBe(true)
    })
})
