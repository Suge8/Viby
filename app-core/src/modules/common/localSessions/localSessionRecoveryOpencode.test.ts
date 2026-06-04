import { describe, expect, it, vi } from 'vitest'

const fakeDb = {}

vi.mock('@/opencode/utils/opencodeStorageDatabase', () => ({
    openOpencodeStorageDatabase: () => fakeDb,
    closeOpencodeStorageDatabase: vi.fn(),
    getOpencodeDatabaseSession: () => ({
        id: 'opencode-1',
        directory: '/tmp/project',
        timeCreated: 1000,
        timeUpdated: 2000,
    }),
    listOpencodeDatabaseSessions: () => [
        {
            id: 'opencode-1',
            directory: '/tmp/project',
            timeCreated: 1000,
            timeUpdated: 2000,
        },
    ],
    readOpencodeDatabaseMessages: () => [
        {
            id: 'message-1',
            sessionId: 'opencode-1',
            timeCreated: 1100,
            timeUpdated: 1200,
            info: { id: 'message-1', sessionID: 'opencode-1', role: 'user' },
        },
    ],
    readOpencodeDatabasePartsByMessage: () => [
        {
            id: 'part-1',
            messageId: 'message-1',
            sessionId: 'opencode-1',
            timeCreated: 1110,
            timeUpdated: 1120,
            part: { id: 'part-1', messageID: 'message-1', sessionID: 'opencode-1', type: 'text', text: 'Recover me' },
        },
    ],
}))

describe('OpenCode local session recovery', () => {
    it('lists and exports sessions from the OpenCode SQLite source', async () => {
        const { listOpencodeLocalSessions, exportOpencodeLocalSession } = await import('./localSessionRecoveryOpencode')

        await expect(listOpencodeLocalSessions('/tmp/project')).resolves.toMatchObject([
            {
                driver: 'opencode',
                providerSessionId: 'opencode-1',
                messageCount: 1,
            },
        ])

        await expect(exportOpencodeLocalSession('/tmp/project', 'opencode-1')).resolves.toMatchObject({
            providerSessionId: 'opencode-1',
            messages: [{ role: 'user', text: 'Recover me', createdAt: 1100 }],
        })
    })
})
