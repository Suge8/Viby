import { describe, expect, it } from 'bun:test'
import { Store } from './index'

function getSessionMetadata(store: Store, sessionId: string) {
    return store.sessions.getSession(sessionId)?.metadata as Record<string, unknown> | null
}

describe('sessions store metadata normalization', () => {
    it('normalizes legacy metadata.flavor into metadata.driver when creating a session', () => {
        const store = new Store(':memory:')

        const session = store.sessions.getOrCreateSession({
            tag: 'legacy-create',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-thread-1'
            }
        })

        expect(getSessionMetadata(store, session.id)).toEqual({
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
            codexSessionId: 'codex-thread-1'
        })
    })

    it('normalizes legacy metadata.flavor into metadata.driver when updating session metadata', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession({
            tag: 'legacy-update',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            }
        })

        const result = store.sessions.updateSessionMetadata(
            session.id,
            {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'gemini',
                geminiSessionId: 'gemini-thread-1'
            },
            session.metadataVersion
        )

        expect(result.result).toBe('success')
        expect(getSessionMetadata(store, session.id)).toEqual({
            path: '/tmp/project',
            host: 'localhost',
            driver: 'gemini',
            geminiSessionId: 'gemini-thread-1'
        })
    })
})
