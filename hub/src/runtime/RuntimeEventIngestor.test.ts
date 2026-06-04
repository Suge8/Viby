import { describe, expect, it, mock } from 'bun:test'
import { RuntimeEventIngestor } from './RuntimeEventIngestor'

function createIngestor(overrides?: {
    getSession?: () => unknown
    updateSessionMetadata?: () => unknown
}): RuntimeEventIngestor {
    return new RuntimeEventIngestor({
        store: {
            sessions: {
                getSession: overrides?.getSession ?? (() => null),
                updateSessionMetadata: overrides?.updateSessionMetadata ?? (() => ({ result: 'error' })),
                updateSessionAgentState: () => ({ result: 'error' }),
            },
            messages: {
                getUninvokedLocalMessages: () => [],
                markMessagesInvoked: () => undefined,
            },
        } as never,
        eventPublisher: { emit: mock(() => undefined) } as never,
        messageService: {
            appendRuntimeMessage: mock(async () => undefined),
            markMessagesInvoked: mock(async () => undefined),
            cancelQueuedMessages: mock(async () => undefined),
        } as never,
        sessionCache: {
            handleSessionAlive: mock(() => undefined),
            handleSessionEnd: mock(() => undefined),
            commitSessionLifecycleState: mock(() => undefined),
            refreshSession: mock(() => undefined),
        } as never,
        sessionStreamManager: {
            applyUpdate: mock(() => null),
            clear: mock(() => null),
            drop: mock(() => undefined),
        } as never,
        markRuntimeStopping: mock(() => undefined),
        getRuntimeStoppingReason: mock(() => undefined),
    })
}

describe('RuntimeEventIngestor', () => {
    it('fails fast on malformed runtime events even when called directly', async () => {
        await expect(
            createIngestor().ingest({
                type: 'runtime.session-alive',
                payload: { sid: 's1', time: Date.now() },
            } as never)
        ).rejects.toThrow()
    })

    it('preserves metadata version-mismatch acks for provider recovery state', async () => {
        const metadata = { path: '/repo', host: 'desk' }
        const ingestor = createIngestor({
            getSession: () => ({ id: 's1', metadata, metadataVersion: 1 }),
            updateSessionMetadata: () => ({ result: 'version-mismatch', version: 2, value: metadata }),
        })

        await expect(
            ingestor.ingest({
                type: 'runtime.metadata-update',
                requestId: 'r1',
                sessionId: 's1',
                expectedVersion: 1,
                metadata,
            })
        ).resolves.toEqual({
            type: 'runtime.metadata-result',
            requestId: 'r1',
            result: 'version-mismatch',
            version: 2,
            value: metadata,
        })
    })
})
