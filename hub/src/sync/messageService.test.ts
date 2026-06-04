import { describe, expect, it, mock } from 'bun:test'
import { Store } from '../store'
import { EventPublisher } from './eventPublisher'
import { MessageService } from './messageService'

function createStoredSession(store: Store, input: Parameters<Store['sessions']['getOrCreateSession']>[0]) {
    return store.sessions.getOrCreateSession(input)
}

function createPublisherHarness() {
    const broadcast = mock((_event: unknown) => {})
    return {
        publisher: new EventPublisher({ broadcast }),
        broadcast,
    }
}

describe('message service', () => {
    it('touches session updatedAt when the user sends a new message', async () => {
        const originalDateNow = Date.now
        let now = 1_000
        Date.now = () => now

        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'session-message-service',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            agentState: null,
            model: 'gpt-5.4',
        })
        const originalUpdatedAt = session.updatedAt
        const { publisher } = createPublisherHarness()
        const service = new MessageService(store, publisher)

        now = 2_000

        try {
            await service.sendMessage(session.id, {
                text: 'hello world',
                localId: 'local-1',
            })
        } finally {
            Date.now = originalDateNow
        }

        const updatedSession = store.sessions.getSession(session.id)
        expect(updatedSession).not.toBeNull()
        expect(updatedSession!.updatedAt).toBe(originalUpdatedAt + 1_000)
    })

    it('keeps message metadata available when appending a user message through the hub owner', async () => {
        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'session-message-service-team-meta',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'claude' },
            agentState: null,
            model: 'sonnet',
        })
        const { publisher } = createPublisherHarness()
        const service = new MessageService(store, publisher)

        await service.appendUserMessage(session.id, {
            text: 'Manager says verify this change',
            meta: {
                sentFrom: 'user',
                customSystemPrompt: 'Focus on verification',
            },
        })

        const storedMessage = store.messages.getMessages(session.id, 1)[0]
        expect(storedMessage?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'user',
                customSystemPrompt: 'Focus on verification',
            },
        })
    })

    it('stores and fans out one durable driver-switched event without touching updatedAt', async () => {
        const originalDateNow = Date.now
        let now = 1_000
        Date.now = () => now

        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'session-message-service-driver-switched',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            agentState: null,
            model: 'gpt-5.4',
        })
        const originalUpdatedAt = session.updatedAt
        const { publisher, broadcast } = createPublisherHarness()
        const service = new MessageService(store, publisher)

        now = 2_000

        try {
            await service.appendDriverSwitchedEvent(session.id, {
                type: 'driver-switched',
                previousDriver: 'codex',
                targetDriver: 'claude',
            })
        } finally {
            Date.now = originalDateNow
        }

        const expectedContent = {
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'driver-switched',
                    previousDriver: 'codex',
                    targetDriver: 'claude',
                },
            },
        }
        expect(store.messages.getMessages(session.id, 1)[0]?.content).toEqual(expectedContent)
        expect(store.sessions.getSession(session.id)?.updatedAt).toBe(originalUpdatedAt)
        expect(broadcast).toHaveBeenCalledTimes(1)
        expect(broadcast.mock.calls[0]?.[0]).toMatchObject({
            type: 'message-received',
            sessionId: session.id,
            message: { content: expectedContent },
        })
    })
})
