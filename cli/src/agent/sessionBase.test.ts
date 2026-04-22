import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { AgentSessionBase } from './sessionBase'

async function flushAsyncWork(): Promise<void> {
    for (let index = 0; index < 12; index += 1) {
        await Promise.resolve()
    }
}

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

describe('AgentSessionBase', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('preserves session-found callbacks without rewriting already-synced metadata', async () => {
        const keepAlive = vi.fn()
        const updateMetadataAndWait = vi.fn(async () => undefined)
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'thread-1' },
                    },
                }),
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId },
                },
            }),
        })
        const callback = vi.fn()
        session.addSessionFoundCallback(callback)

        session.onSessionFound('thread-1')
        session.onSessionFound('thread-1')
        await flushAsyncWork()

        expect(updateMetadataAndWait).not.toHaveBeenCalled()
        expect(callback).toHaveBeenCalledTimes(2)

        session.stopKeepAlive()
    })

    it('deduplicates concurrent durable session-found writes for the same session id', async () => {
        const keepAlive = vi.fn()
        type TestMetadata = {
            path: string
            host: string
            driver: string
            runtimeHandles?: Record<string, { sessionId: string }>
        }
        let metadata: TestMetadata = {
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
        }
        const updateMetadataAndWait = vi.fn(async (updater: (metadata: TestMetadata) => TestMetadata) => {
            metadata = updater(metadata)
        })
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait,
                getMetadataSnapshot: () => metadata,
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (currentMetadata, sessionId) => ({
                ...currentMetadata,
                driver: 'codex',
                runtimeHandles: {
                    ...currentMetadata.runtimeHandles,
                    codex: { sessionId },
                },
            }),
        })

        session.onSessionFound('thread-1')
        session.onSessionFound('thread-1')
        await flushAsyncWork()

        expect(updateMetadataAndWait).toHaveBeenCalledTimes(1)
        session.stopKeepAlive()
    })

    it('re-syncs metadata when the same session id is known locally but missing from the current driver slot', async () => {
        const keepAlive = vi.fn()
        const updateMetadataAndWait = vi.fn(async () => undefined)
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                    runtimeHandles: {
                        claude: { sessionId: 'claude-thread-1' },
                    },
                }),
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: 'thread-1',
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId },
                },
            }),
        })

        session.onSessionFound('thread-1')
        await flushAsyncWork()

        expect(updateMetadataAndWait).toHaveBeenCalledTimes(1)
        expect(updateMetadataAndWait).toHaveBeenCalledWith(expect.any(Function), {
            touchUpdatedAt: false,
        })

        session.stopKeepAlive()
    })

    it('ignores malformed session ids instead of writing metadata or firing callbacks', async () => {
        const keepAlive = vi.fn()
        const updateMetadataAndWait = vi.fn(async () => undefined)
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait,
                getMetadataSnapshot: () => null,
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId },
                },
            }),
        })
        const callback = vi.fn()
        session.addSessionFoundCallback(callback)

        session.onSessionFound('')
        session.onSessionFound('   ')
        session.onSessionFound(undefined)
        await flushAsyncWork()

        expect(updateMetadataAndWait).not.toHaveBeenCalled()
        expect(callback).not.toHaveBeenCalled()

        session.stopKeepAlive()
    })

    it('deduplicates concurrent runtime stop requests through the registered owner', async () => {
        const keepAlive = vi.fn()
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait: vi.fn(async () => undefined),
                getMetadataSnapshot: () => null,
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata) => metadata,
        })
        let releaseStop!: () => void
        const stopDone = new Promise<void>((resolve) => {
            releaseStop = resolve
        })
        const stopHandler = vi.fn(async () => stopDone)
        session.setRuntimeStopHandler(stopHandler)

        const firstStop = session.requestRuntimeStop()
        const secondStop = session.requestRuntimeStop()
        await flushAsyncWork()

        expect(stopHandler).toHaveBeenCalledTimes(1)

        releaseStop()
        await Promise.all([firstStop, secondStop])

        session.stopKeepAlive()
    })

    it('does not mutate unrelated driver handles when syncing the current driver session id', async () => {
        const keepAlive = vi.fn()
        const updateMetadataAndWait = vi.fn(
            async (updater: (metadata: Record<string, unknown>) => Record<string, unknown>) =>
                updater({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'claude',
                    runtimeHandles: {
                        claude: { sessionId: 'claude-thread-1' },
                    },
                })
        )
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'claude',
                    runtimeHandles: {
                        claude: { sessionId: 'claude-thread-1' },
                    },
                }),
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId },
                },
            }),
        })

        session.onSessionFound('codex-thread-1')
        await flushAsyncWork()

        const metadataUpdater = updateMetadataAndWait.mock.calls[0]?.[0] as (
            metadata: Record<string, unknown>
        ) => Record<string, unknown>
        expect(
            metadataUpdater({
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
                runtimeHandles: {
                    claude: { sessionId: 'claude-thread-1' },
                },
            })
        ).toEqual({
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-thread-1' },
                codex: { sessionId: 'codex-thread-1' },
            },
        })

        session.stopKeepAlive()
    })

    it('retries a durable metadata write after a failed session-found sync', async () => {
        const keepAlive = vi.fn()
        const updateMetadataAndWait = vi
            .fn()
            .mockRejectedValueOnce(new Error('metadata update failed'))
            .mockResolvedValueOnce(undefined)
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                }),
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId },
                },
            }),
        })

        session.onSessionFound('thread-1')
        await flushAsyncWork()
        session.onSessionFound('thread-1')
        await flushAsyncWork()

        expect(updateMetadataAndWait).toHaveBeenCalledTimes(2)

        session.stopKeepAlive()
    })

    it('reverts the in-memory session id when durable session-found sync fails', async () => {
        const keepAlive = vi.fn()
        const updateMetadataAndWait = vi.fn().mockRejectedValue(new Error('metadata update failed'))
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadataAndWait,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                }),
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: 'thread-0',
            messageQueue: new MessageQueue2<string>((value) => value),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId },
                },
            }),
        })

        session.onSessionFound('thread-1')
        await flushAsyncWork()

        expect(session.sessionId).toBe('thread-0')
        expect(updateMetadataAndWait).toHaveBeenCalledTimes(1)

        session.stopKeepAlive()
    })
})
