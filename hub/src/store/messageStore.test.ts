import { describe, expect, it } from 'bun:test'

import { Store } from './index'

describe('MessageStore', () => {
    it('allocates message seq from the session owner and deduplicates local_id inside one transaction', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession(
            'tag-1',
            { path: '/tmp/project', flavor: 'codex' },
            {},
            undefined,
            undefined,
            undefined,
            undefined,
            'session-1'
        )

        const first = store.messages.addMessage(session.id, { role: 'user', content: [] }, 'local-1')
        const duplicate = store.messages.addMessage(session.id, { role: 'user', content: ['ignored'] }, 'local-1')
        const second = store.messages.addMessage(session.id, { role: 'assistant', content: [] })

        expect(first.seq).toBe(1)
        expect(duplicate.id).toBe(first.id)
        expect(duplicate.seq).toBe(1)
        expect(second.seq).toBe(2)
    })
})
