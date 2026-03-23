import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    getOrCreateMachine: vi.fn(async () => ({
        id: 'machine-1',
        metadata: null,
        metadataVersion: 0,
        runnerState: null,
        runnerStateVersion: 0,
        seq: 0,
        createdAt: 0,
        updatedAt: 0,
        active: true,
        activeAt: 0
    })),
    getOrCreateSession: vi.fn(async (options: Record<string, unknown>) => ({
        id: typeof options.sessionId === 'string' ? options.sessionId : 'session-new',
        seq: 0,
        createdAt: 0,
        updatedAt: 0,
        active: false,
        activeAt: 0,
        metadata: options.metadata ?? null,
        metadataVersion: 1,
        agentState: options.state ?? null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        todos: undefined,
        model: null,
        modelReasoningEffort: null,
        permissionMode: undefined,
        collaborationMode: undefined
    })),
    sessionSyncClient: vi.fn(() => ({ kind: 'session-client' })),
    notifyRunnerSessionStarted: vi.fn(async () => ({})),
    readSettings: vi.fn(async () => ({ machineId: 'machine-1' }))
}))

vi.mock('@/api/api', () => ({
    ApiClient: {
        create: vi.fn(async () => ({
            getOrCreateMachine: harness.getOrCreateMachine,
            getOrCreateSession: harness.getOrCreateSession,
            sessionSyncClient: harness.sessionSyncClient
        }))
    }
}))

vi.mock('@/runner/controlClient', () => ({
    notifyRunnerSessionStarted: harness.notifyRunnerSessionStarted
}))

vi.mock('@/persistence', () => ({
    readSettings: harness.readSettings
}))

vi.mock('@/configuration', () => ({
    configuration: {
        vibyHomeDir: '/tmp/viby-home'
    }
}))

vi.mock('@/projectPath', () => ({
    runtimePath: () => '/tmp/viby-lib'
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/project'
}))

vi.mock('@/utils/worktreeEnv', () => ({
    readWorktreeEnv: () => null
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}))

import { bootstrapSession } from './sessionFactory'

describe('bootstrapSession', () => {
    beforeEach(() => {
        harness.getOrCreateMachine.mockClear()
        harness.getOrCreateSession.mockClear()
        harness.sessionSyncClient.mockClear()
        harness.notifyRunnerSessionStarted.mockClear()
        harness.readSettings.mockClear()
        harness.readSettings.mockResolvedValue({ machineId: 'machine-1' })
    })

    it('forwards an explicit viby session id into session bootstrap', async () => {
        const result = await bootstrapSession({
            flavor: 'codex',
            startedBy: 'runner',
            sessionId: '11111111-1111-4111-8111-111111111111'
        })

        expect(harness.getOrCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: '11111111-1111-4111-8111-111111111111'
        }))
        expect(result.sessionInfo.id).toBe('11111111-1111-4111-8111-111111111111')
        expect(harness.notifyRunnerSessionStarted).toHaveBeenCalledWith(
            '11111111-1111-4111-8111-111111111111',
            expect.objectContaining({
                path: '/tmp/project',
                startedBy: 'runner',
                flavor: 'codex'
            })
        )
    })
})
