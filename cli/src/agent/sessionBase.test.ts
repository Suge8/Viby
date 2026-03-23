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
                getMetadataSnapshot: () => ({ path: '/tmp/project', host: 'localhost', codexSessionId: 'thread-1' })
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
                codexSessionId: sessionId
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

    it('re-syncs metadata when the same session id is known locally but missing from metadata', () => {
        const keepAlive = vi.fn()
        const updateMetadata = vi.fn()
        const session = new AgentSessionBase<string>({
            api: {} as never,
            client: {
                keepAlive,
                updateMetadata,
                getMetadataSnapshot: () => ({ path: '/tmp/project', host: 'localhost' })
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
                codexSessionId: sessionId
            })
        })

        session.onSessionFound('thread-1')

        expect(updateMetadata).toHaveBeenCalledTimes(1)

        session.stopKeepAlive()
    })
})
