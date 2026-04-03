import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { AgentSessionBase } from './sessionBase'

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}))

describe('AgentSessionBase', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('deduplicates metadata sync while preserving session-found callbacks', () => {
        const keepAlive = vi.fn()
        const updateMetadata = vi.fn()
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadata,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'thread-1' }
                    }
                })
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            onModeChange: vi.fn(),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId }
                }
            })
        })
        const callback = vi.fn()
        session.addSessionFoundCallback(callback)

        session.onSessionFound('thread-1')
        session.onSessionFound('thread-1')

        expect(updateMetadata).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledTimes(2)

        session.stopKeepAlive()
    })

    it('re-syncs metadata when the same session id is known locally but missing from the current driver slot', () => {
        const keepAlive = vi.fn()
        const updateMetadata = vi.fn()
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadata,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                    runtimeHandles: {
                        claude: { sessionId: 'claude-thread-1' }
                    }
                })
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: 'thread-1',
            messageQueue: new MessageQueue2<string>((value) => value),
            onModeChange: vi.fn(),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId }
                }
            })
        })

        session.onSessionFound('thread-1')

        expect(updateMetadata).toHaveBeenCalledTimes(1)
        expect(updateMetadata).toHaveBeenCalledWith(expect.any(Function), {
            touchUpdatedAt: false
        })

        session.stopKeepAlive()
    })

    it('ignores malformed session ids instead of writing metadata or firing callbacks', () => {
        const keepAlive = vi.fn()
        const updateMetadata = vi.fn()
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadata,
                getMetadataSnapshot: () => null
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            onModeChange: vi.fn(),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId }
                }
            })
        })
        const callback = vi.fn()
        session.addSessionFoundCallback(callback)

        session.onSessionFound('')
        session.onSessionFound('   ')
        session.onSessionFound(undefined)

        expect(updateMetadata).not.toHaveBeenCalled()
        expect(callback).not.toHaveBeenCalled()

        session.stopKeepAlive()
    })

    it('does not mutate unrelated driver handles when syncing the current driver session id', () => {
        const keepAlive = vi.fn()
        const updateMetadata = vi.fn((updater: (metadata: Record<string, unknown>) => Record<string, unknown>) =>
            updater({
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
                runtimeHandles: {
                    claude: { sessionId: 'claude-thread-1' }
                }
            })
        )
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadata,
                getMetadataSnapshot: () => ({
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'claude',
                    runtimeHandles: {
                        claude: { sessionId: 'claude-thread-1' }
                    }
                })
            } as never,
            path: '/tmp/project',
            logPath: '/tmp/project/test.log',
            sessionId: null,
            messageQueue: new MessageQueue2<string>((value) => value),
            onModeChange: vi.fn(),
            sessionLabel: 'TestSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                driver: 'codex',
                runtimeHandles: {
                    ...metadata.runtimeHandles,
                    codex: { sessionId }
                }
            })
        })

        session.onSessionFound('codex-thread-1')

        const metadataUpdater = updateMetadata.mock.calls[0]?.[0] as ((metadata: Record<string, unknown>) => Record<string, unknown>)
        expect(metadataUpdater({
            path: '/tmp/project',
            host: 'localhost',
            driver: 'claude',
            runtimeHandles: {
                claude: { sessionId: 'claude-thread-1' }
            }
        })).toEqual({
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-thread-1' },
                codex: { sessionId: 'codex-thread-1' }
            }
        })

        session.stopKeepAlive()
    })
})
