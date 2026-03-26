import { describe, expect, it } from 'bun:test'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { EventPublisher } from './eventPublisher'
import { MessageService } from './messageService'

function createStoredSession(
    store: Store,
    input: Parameters<Store['sessions']['getOrCreateSession']>[0]
) {
    return store.sessions.getOrCreateSession(input)
}

function createIoStub(): Server {
    return {
        of() {
            return {
                to() {
                    return {
                        emit() {
                        }
                    }
                }
            }
        }
    } as unknown as Server
}

describe('message service', () => {
    it('touches session updatedAt when the user sends a new message', async () => {
        const originalDateNow = Date.now
        let now = 1_000
        Date.now = () => now

        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'session-message-service',
            metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            agentState: null,
            model: 'gpt-5.4'
        })
        const originalUpdatedAt = session.updatedAt
        const publisher = new EventPublisher({
            broadcast() {
            }
        })
        const service = new MessageService(store, createIoStub(), publisher)

        now = 2_000

        try {
            await service.sendMessage(session.id, {
                text: 'hello world',
                localId: 'local-1'
            })
        } finally {
            Date.now = originalDateNow
        }

        const updatedSession = store.sessions.getSession(session.id)
        expect(updatedSession).not.toBeNull()
        expect(updatedSession!.updatedAt).toBe(originalUpdatedAt + 1_000)
    })

    it('keeps internal team metadata available when appending a user message through the hub owner', async () => {
        const store = new Store(':memory:')
        const session = createStoredSession(store, {
            tag: 'session-message-service-team-meta',
            metadata: { path: '/tmp/project', host: 'localhost', flavor: 'claude' },
            agentState: null,
            model: 'sonnet'
        })
        const publisher = new EventPublisher({
            broadcast() {
            }
        })
        const service = new MessageService(store, createIoStub(), publisher)

        await service.appendUserMessage(session.id, {
            text: 'Manager says verify this change',
            meta: {
                sentFrom: 'manager',
                teamProjectId: 'project-1',
                managerSessionId: 'manager-session-1',
                memberId: 'member-1',
                sessionRole: 'member',
                teamMessageKind: 'verify-request',
                controlOwner: 'manager'
            }
        })

        const storedMessage = store.messages.getMessages(session.id, 1)[0]
        expect(storedMessage?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'manager',
                teamProjectId: 'project-1',
                managerSessionId: 'manager-session-1',
                memberId: 'member-1',
                sessionRole: 'member',
                teamMessageKind: 'verify-request',
                controlOwner: 'manager'
            }
        })
    })
})
