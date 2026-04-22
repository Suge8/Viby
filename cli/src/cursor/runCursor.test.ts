import type { SessionHandoffSnapshot } from '@viby/protocol/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnhancedMode } from './loop'

const harness = vi.hoisted(() => ({
    bootstrapArgs: [] as Array<Record<string, unknown>>,
    onUserMessage: null as null | ((message: { content: { text: string; attachments: unknown[] } }) => void),
    rpcHandlers: new Map<string, (payload: unknown) => Promise<unknown>>(),
    queueModes: [] as EnhancedMode[],
    queuedUserMessages: [] as Array<{ text: string; attachments?: unknown[] }>,
    loopArgs: [] as Array<Record<string, unknown>>,
    sessionState: {
        permissionMode: 'default' as EnhancedMode['permissionMode'],
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
    loop: vi.fn(
        async (
            options: {
                messageQueue: {
                    queue: Array<{ mode: EnhancedMode }>
                }
                onSessionReady?: (session: { setPermissionMode(mode: EnhancedMode['permissionMode']): void }) => void
            } & Record<string, unknown>
        ) => {
            harness.loopArgs.push(options)

            const sessionInstance = {
                stopKeepAlive() {},
                setPermissionMode(mode: EnhancedMode['permissionMode']) {
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

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: vi.fn((text: string) => text),
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: vi.fn(() => '/tmp/viby-cursor'),
}))

import { runCursor } from './runCursor'

function createSessionContinuityHandoff(): SessionHandoffSnapshot {
    return {
        driver: 'codex',
        workingDirectory: '/repo/project',
        liveConfig: {
            model: 'gpt-5.4',
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
                text: 'Continue the same Cursor session.',
            },
        ],
    }
}

describe('runCursor continuity', () => {
    beforeEach(() => {
        harness.bootstrapArgs.length = 0
        harness.loopArgs.length = 0
        harness.queueModes = []
        harness.queuedUserMessages = []
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.sessionState.permissionMode = 'default'
    })

    it('injects session continuity exactly once into the first queued Cursor turn', async () => {
        harness.queuedUserMessages = [
            { text: 'Resume the closed Cursor session.', attachments: [] },
            { text: 'Second turn should be clean.', attachments: [] },
        ]

        await runCursor({
            startedBy: 'runner',
            driverSwitchBootstrap: true,
            sessionContinuityHandoff: createSessionContinuityHandoff(),
        })

        expect(harness.queueModes).toHaveLength(2)
        expect(harness.queueModes[0]?.developerInstructions).toContain(
            'Private continuity handoff for resuming the same Viby session.'
        )
        expect(harness.queueModes[0]?.developerInstructions).toContain('"previousDriver": "codex"')
        expect(harness.queueModes[1]?.developerInstructions).toBeUndefined()
        expect(harness.bootstrapArgs[0]?.driverSwitchBootstrap).toBe(true)
    })
})
