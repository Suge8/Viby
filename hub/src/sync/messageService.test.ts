import { describe, expect, it } from 'bun:test'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { EventPublisher } from './eventPublisher'
import { MessageService } from './messageService'

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
        const session = store.sessions.getOrCreateSession(
            'session-message-service',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
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
})
