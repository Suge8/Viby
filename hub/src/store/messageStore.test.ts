import { describe, expect, it } from 'bun:test'

import { Store } from './index'

function createStoredSession(store: Store, input: Parameters<Store['sessions']['getOrCreateSession']>[0]) {
    return store.sessions.getOrCreateSession(input)
}

describe('MessageStore', () => {
    it('allocates message seq from the session owner and deduplicates local_id inside one transaction', () => {
        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'tag-1',
            metadata: { path: '/tmp/project', driver: 'codex' },
            agentState: {},
            sessionId: 'session-1',
        })

        const first = store.messages.addMessage(session.id, { role: 'user', content: [] }, 'local-1')
        const duplicate = store.messages.addMessage(session.id, { role: 'user', content: ['ignored'] }, 'local-1')
        const second = store.messages.addMessage(session.id, { role: 'assistant', content: [] })

        expect(first.seq).toBe(1)
        expect(duplicate.id).toBe(first.id)
        expect(duplicate.seq).toBe(1)
        expect(second.seq).toBe(2)
        expect(store.sessions.getSession(session.id)).toMatchObject({
            updatedAt: first.createdAt,
            latestActivityAt: first.createdAt,
            latestActivityKind: 'user',
            latestCompletedReplyAt: null,
        })
    })

    it('tracks queued local messages through invoked and canceled states', () => {
        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'tag-queued',
            metadata: { path: '/tmp/project', driver: 'codex' },
            agentState: {},
            sessionId: 'session-queued',
        })

        const queued = store.messages.addMessage(session.id, { role: 'user', content: [] }, 'local-queued', 1_000, null)
        const canceled = store.messages.addMessage(
            session.id,
            { role: 'user', content: ['cancel'] },
            'local-canceled',
            1_100,
            null
        )

        expect(queued.invokedAt).toBeNull()
        expect(store.messages.getUninvokedLocalMessages(session.id).map((message) => message.localId)).toEqual([
            'local-queued',
            'local-canceled',
        ])

        expect(store.messages.markMessagesInvoked(session.id, ['local-queued'], 1_500)).toBe(1)
        expect(store.messages.cancelQueuedMessages(session.id, ['local-canceled', 'local-queued'])).toEqual([
            'local-canceled',
        ])
        const remainingMessages = store.messages.getMessages(session.id, 10)
        expect(remainingMessages.map((message) => message.id)).toEqual([queued.id])
        expect(remainingMessages.map((message) => message.id)).not.toContain(canceled.id)
        expect(remainingMessages[0]?.invokedAt).toBe(1_500)
    })

    it('persists invoked messages with invokedAt resolved from createdAt when omitted', () => {
        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'tag-invoked',
            metadata: { path: '/tmp/project', driver: 'codex' },
            agentState: {},
            sessionId: 'session-invoked',
        })

        const stored = store.messages.addMessage(
            session.id,
            {
                role: 'user',
                content: [{ type: 'text', text: 'invoke immediately' }],
            },
            'local-invoked',
            2_000
        )

        expect(stored).toMatchObject({
            localId: 'local-invoked',
            createdAt: 2_000,
            invokedAt: 2_000,
        })
        expect(store.messages.getUninvokedLocalMessages(session.id)).toEqual([])
    })

    it('keeps queued local-id inserts idempotent without mutating the first durable message', () => {
        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'tag-idempotent',
            metadata: { path: '/tmp/project', driver: 'codex' },
            agentState: {},
            sessionId: 'session-idempotent',
        })

        const first = store.messages.addMessage(
            session.id,
            {
                role: 'user',
                content: [{ type: 'text', text: 'first payload wins' }],
            },
            'local-same',
            3_000,
            null
        )
        const duplicate = store.messages.addMessage(
            session.id,
            {
                role: 'user',
                content: [{ type: 'text', text: 'duplicate payload ignored' }],
            },
            'local-same',
            4_000,
            4_000
        )

        expect(duplicate).toEqual(first)
        expect(store.messages.getMessages(session.id, 10)).toEqual([first])
        expect(store.messages.getUninvokedLocalMessages(session.id)).toEqual([first])
    })

    it('cancels only still-uninvoked local messages from a mixed request', () => {
        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'tag-cancel-subset',
            metadata: { path: '/tmp/project', driver: 'codex' },
            agentState: {},
            sessionId: 'session-cancel-subset',
        })

        const invoked = store.messages.addMessage(
            session.id,
            { role: 'user', content: ['already sent'] },
            'local-invoked',
            5_000,
            5_100
        )
        const firstQueued = store.messages.addMessage(
            session.id,
            { role: 'user', content: ['cancel first'] },
            'local-cancel-1',
            5_200,
            null
        )
        const secondQueued = store.messages.addMessage(
            session.id,
            { role: 'user', content: ['cancel second'] },
            'local-cancel-2',
            5_300,
            null
        )

        const canceled = store.messages.cancelQueuedMessages(session.id, [
            'local-missing',
            'local-cancel-2',
            'local-invoked',
            'local-cancel-1',
        ])

        expect([...canceled].sort()).toEqual(['local-cancel-1', 'local-cancel-2'])
        expect(store.messages.getMessages(session.id, 10).map((message) => message.id)).toEqual([invoked.id])
        expect(store.messages.getMessages(session.id, 10).map((message) => message.id)).not.toContain(firstQueued.id)
        expect(store.messages.getMessages(session.id, 10).map((message) => message.id)).not.toContain(secondQueued.id)
    })

    it('marks merged local-id collisions invoked before moving messages into the target session', () => {
        const store = new Store(':memory:')
        const source = createStoredSession(store, {
            tag: 'tag-merge-source',
            metadata: { path: '/tmp/source', driver: 'codex' },
            agentState: {},
            sessionId: 'session-merge-source',
        })
        const target = createStoredSession(store, {
            tag: 'tag-merge-target',
            metadata: { path: '/tmp/target', driver: 'codex' },
            agentState: {},
            sessionId: 'session-merge-target',
        })

        const targetMessage = store.messages.addMessage(
            target.id,
            { role: 'user', content: ['target owns local id'] },
            'local-collision',
            6_000,
            6_000
        )
        const sourceCollision = store.messages.addMessage(
            source.id,
            { role: 'user', content: ['source collision'] },
            'local-collision',
            6_100,
            null
        )
        const sourceQueued = store.messages.addMessage(
            source.id,
            { role: 'user', content: ['source queued'] },
            'local-source-queued',
            6_200,
            null
        )

        expect(store.messages.mergeSessionMessages(source.id, target.id)).toMatchObject({
            moved: 2,
            oldMaxSeq: 2,
            newMaxSeq: 1,
        })

        const merged = store.messages.getMessages(target.id, 10)
        expect(merged.find((message) => message.id === targetMessage.id)).toMatchObject({
            localId: 'local-collision',
            invokedAt: 6_000,
        })
        expect(merged.find((message) => message.id === sourceCollision.id)).toMatchObject({
            localId: null,
            invokedAt: 6_100,
        })
        expect(merged.find((message) => message.id === sourceQueued.id)).toMatchObject({
            localId: 'local-source-queued',
            invokedAt: null,
        })
        expect(store.messages.getUninvokedLocalMessages(target.id).map((message) => message.localId)).toEqual([
            'local-source-queued',
        ])
    })
})
