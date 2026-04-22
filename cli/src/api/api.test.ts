import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './api'

vi.mock('@/api/auth', () => ({
    getAuthToken: () => 'token',
}))

vi.mock('@/configuration', () => ({
    configuration: {
        apiUrl: 'http://localhost:3000',
    },
}))

vi.mock('./apiMachine', () => ({
    ApiMachineClient: class {},
}))

vi.mock('./apiSession', () => ({
    ApiSessionClient: class {},
}))

describe('ApiClient', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('creates sessions through the bootstrap route without deprecated role fields', async () => {
        vi.spyOn(axios, 'post').mockResolvedValue({
            data: {
                session: {
                    id: 'session-1',
                    seq: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    active: true,
                    activeAt: 1,
                    metadata: null,
                    metadataVersion: 1,
                    agentState: null,
                    agentStateVersion: 1,
                    thinking: false,
                    thinkingAt: 0,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'high',
                    permissionMode: 'default',
                    collaborationMode: 'default',
                },
            },
        } as never)

        const api = await ApiClient.create()
        const session = await api.getOrCreateSession({
            tag: 'tag-1',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
            },
            state: null,
        })

        expect(axios.post).toHaveBeenCalledWith(
            'http://localhost:3000/cli/sessions',
            expect.objectContaining({
                tag: 'tag-1',
            }),
            expect.any(Object)
        )
        expect(session.id).toBe('session-1')
    })
})
