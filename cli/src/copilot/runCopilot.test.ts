import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnhancedMode } from './types'

const harness = vi.hoisted(() => {
    const rpcHandlers = new Map<string, (payload: unknown) => Promise<unknown> | unknown>()

    return {
        bootstrapArgs: [] as Array<Record<string, unknown>>,
        loopArgs: [] as Array<Record<string, unknown>>,
        onUserMessage: null as
            | null
            | ((message: {
                  content: { text: string; attachments: unknown[] }
                  meta?: Record<string, unknown>
              }) => void),
        rpcHandlers,
        queueModes: [] as EnhancedMode[],
        killSessionHandler: null as null | (() => Promise<unknown> | unknown),
        cleanupAndExit: vi.fn(async () => {}),
        requestRuntimeStop: vi.fn(async () => true),
        durableSessionId: 'hub-session-1',
        queuedUserMessages: [] as Array<{ text: string; attachments?: unknown[]; meta?: Record<string, unknown> }>,
        sessionState: {
            permissionMode: 'default' as EnhancedMode['permissionMode'],
            model: null as string | null,
        },
    }
})

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: vi.fn(async (options: Record<string, unknown>) => {
        harness.bootstrapArgs.push(options)
        return {
            api: {},
            session: {
                sessionId: harness.durableSessionId,
                getTeamContextSnapshot() {
                    return undefined
                },
                onUserMessage(handler: typeof harness.onUserMessage) {
                    harness.onUserMessage = handler
                },
                rpcHandlerManager: {
                    registerHandler(method: string, handler: (payload: unknown) => Promise<unknown> | unknown) {
                        harness.rpcHandlers.set(method, handler)
                    },
                },
            },
        }
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
    registerKillSessionHandler(_rpcHandlerManager: unknown, handler: () => Promise<unknown> | unknown) {
        harness.killSessionHandler = handler
    },
}))

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: (text: string) => text,
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/viby-copilot',
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug() {},
    },
}))

vi.mock('./loop', () => ({
    copilotLoop: async (
        options: {
            messageQueue: {
                queue: Array<{ mode: EnhancedMode }>
            }
            onSessionReady?: (session: {
                stopKeepAlive(): void
                requestRuntimeStop(): Promise<boolean>
                setPermissionMode(mode: EnhancedMode['permissionMode']): void
                setModel(model: string | null): void
            }) => void
        } & Record<string, unknown>
    ) => {
        harness.loopArgs.push(options)

        const sessionInstance = {
            stopKeepAlive() {},
            requestRuntimeStop: harness.requestRuntimeStop,
            setPermissionMode(mode: EnhancedMode['permissionMode']) {
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
            model: 'gpt-5.4-mini',
        })

        expect(result).toEqual({
            applied: {
                permissionMode: 'default',
                model: 'gpt-5.4-mini',
            },
        })

        const queuedUserMessages =
            harness.queuedUserMessages.length > 0
                ? harness.queuedUserMessages
                : [{ text: 'ping', attachments: [], meta: undefined }]
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

import { runCopilot } from './runCopilot'

describe('runCopilot', () => {
    beforeEach(() => {
        harness.bootstrapArgs.length = 0
        harness.loopArgs.length = 0
        harness.queueModes = []
        harness.queuedUserMessages = []
        harness.onUserMessage = null
        harness.rpcHandlers.clear()
        harness.killSessionHandler = null
        harness.cleanupAndExit.mockClear()
        harness.requestRuntimeStop.mockClear()
        harness.durableSessionId = 'hub-session-1'
        harness.sessionState.permissionMode = 'default'
        harness.sessionState.model = null
    })

    it('drops stale non-canonical resume handles before entering the Copilot loop', async () => {
        await runCopilot({
            startedBy: 'runner',
            resumeSessionId: 'stale-provider-handle',
        })

        expect(harness.loopArgs[0]?.durableSessionId).toBe('hub-session-1')
        expect(harness.loopArgs[0]?.resumeSessionId).toBeUndefined()
        expect(harness.queueModes[0]).toEqual({
            permissionMode: 'default',
            model: 'gpt-5.4-mini',
            developerInstructions: undefined,
        })
    })

    it('preserves the canonical durable resume handle when it matches the Hub owner', async () => {
        await runCopilot({
            startedBy: 'runner',
            resumeSessionId: 'hub-session-1',
        })

        expect(harness.loopArgs[0]?.durableSessionId).toBe('hub-session-1')
        expect(harness.loopArgs[0]?.resumeSessionId).toBe('hub-session-1')
    })

    it('routes killSession through the active runtime stop owner', async () => {
        await runCopilot({
            startedBy: 'runner',
        })

        expect(harness.killSessionHandler).toBeTypeOf('function')
        const cleanupCallsBeforeKill = harness.cleanupAndExit.mock.calls.length

        await harness.killSessionHandler?.()

        expect(harness.requestRuntimeStop).toHaveBeenCalledTimes(1)
        expect(harness.cleanupAndExit.mock.calls.length).toBe(cleanupCallsBeforeKill)
    })
})
