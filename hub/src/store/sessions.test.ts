import { describe, expect, it } from 'bun:test'
import { Store } from './index'

function getSessionMetadata(store: Store, sessionId: string) {
    return store.sessions.getSession(sessionId)?.metadata as Record<string, unknown> | null
}

describe('sessions store metadata normalization', () => {
    it('rejects legacy metadata.flavor when creating a session', () => {
        const store = new Store(':memory:')

        expect(() =>
            store.sessions.getOrCreateSession({
                tag: 'legacy-create',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    flavor: 'codex',
                },
            })
        ).toThrow('metadata.driver')
    })

    it('rejects legacy metadata.flavor when updating session metadata', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession({
            tag: 'legacy-update',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
            },
        })

        expect(() =>
            store.sessions.updateSessionMetadata(
                session.id,
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    flavor: 'gemini',
                },
                session.metadataVersion
            )
        ).toThrow('metadata.driver')
    })
})
