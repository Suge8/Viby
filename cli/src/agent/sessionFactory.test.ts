import { beforeEach, describe, expect, it, vi } from 'vitest'

const { harness, sessionClientState } = vi.hoisted(() => {
    const state = {
        metadata: null as Record<string, unknown> | null,
        updateMetadataAndWait: vi.fn(async (handler: (metadata: Record<string, unknown>) => Record<string, unknown>) => {
            const current = state.metadata ?? {}
            state.metadata = handler(current)
        }),
        getMetadataSnapshot: vi.fn(() => state.metadata),
    }

    return {
        sessionClientState: state,
        harness: {
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
            sessionSyncClient: vi.fn((sessionInfo: { metadata?: Record<string, unknown> | null }) => {
                state.metadata = (sessionInfo.metadata ?? null) as Record<string, unknown> | null
                return {
                    updateMetadataAndWait: state.updateMetadataAndWait,
                    getMetadataSnapshot: state.getMetadataSnapshot,
                }
            }),
            notifyRunnerSessionStarted: vi.fn(async () => ({})),
            readSettings: vi.fn(async () => ({ machineId: 'machine-1' }))
        }
    }
})

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
        sessionClientState.metadata = null
        sessionClientState.updateMetadataAndWait.mockClear()
        sessionClientState.getMetadataSnapshot.mockClear()
        harness.getOrCreateMachine.mockClear()
        harness.getOrCreateSession.mockClear()
        harness.sessionSyncClient.mockClear()
        harness.notifyRunnerSessionStarted.mockClear()
        harness.readSettings.mockClear()
        harness.readSettings.mockResolvedValue({ machineId: 'machine-1' })
    })

    it('persists authoritative driver metadata for new sessions', async () => {
        await bootstrapSession({
            driver: 'codex',
            startedBy: 'runner'
        })

        expect(harness.getOrCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                driver: 'codex',
                path: '/tmp/project',
                startedBy: 'runner'
            })
        }))
    })

    it('forwards an explicit viby session id into session bootstrap without inventing runtime handles', async () => {
        const result = await bootstrapSession({
            driver: 'codex',
            startedBy: 'runner',
            sessionId: '11111111-1111-4111-8111-111111111111'
        })

        expect(harness.getOrCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: '11111111-1111-4111-8111-111111111111',
            metadata: expect.objectContaining({
                driver: 'codex'
            })
        }))
        expect(result.sessionInfo.id).toBe('11111111-1111-4111-8111-111111111111')
        expect(harness.notifyRunnerSessionStarted).toHaveBeenCalledWith(
            '11111111-1111-4111-8111-111111111111',
            expect.objectContaining({
                path: '/tmp/project',
                startedBy: 'runner',
                driver: 'codex'
            })
        )
        const reportCall = harness.notifyRunnerSessionStarted.mock.calls[0] as unknown[] | undefined
        expect(reportCall).toBeDefined()
        const reportedMetadata = reportCall?.[1] as {
            runtimeHandles?: unknown
        }
        expect('runtimeHandles' in reportedMetadata).toBe(false)
    })

    it('converges driver metadata for reused session ids without deleting unrelated runtime handles', async () => {
        harness.getOrCreateSession.mockResolvedValueOnce({
            id: 'session-existing',
            seq: 0,
            createdAt: 0,
            updatedAt: 0,
            active: false,
            activeAt: 0,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
                runtimeHandles: {
                    claude: { sessionId: 'claude-thread-1' }
                }
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 1,
            thinking: false,
            thinkingAt: 0,
            todos: undefined,
            model: null,
            modelReasoningEffort: null,
            permissionMode: undefined,
            collaborationMode: undefined
        })

        const result = await bootstrapSession({
            driver: 'codex',
            startedBy: 'runner',
            sessionId: 'session-existing'
        })

        expect(sessionClientState.updateMetadataAndWait).toHaveBeenCalledTimes(1)
        expect(result.metadata).toEqual(expect.objectContaining({
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-thread-1' }
            }
        }))
        expect(harness.notifyRunnerSessionStarted).toHaveBeenCalledWith(
            'session-existing',
            expect.objectContaining({
                driver: 'codex',
                runtimeHandles: {
                    claude: { sessionId: 'claude-thread-1' }
                }
            })
        )
    })

    it('fails bootstrap explicitly when reused-session metadata sync does not converge the target driver', async () => {
        sessionClientState.updateMetadataAndWait.mockImplementationOnce(async () => {
            sessionClientState.metadata = {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            }
        })
        harness.getOrCreateSession.mockResolvedValueOnce({
            id: 'session-existing',
            seq: 0,
            createdAt: 0,
            updatedAt: 0,
            active: false,
            activeAt: 0,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 1,
            thinking: false,
            thinkingAt: 0,
            todos: undefined,
            model: null,
            modelReasoningEffort: null,
            permissionMode: undefined,
            collaborationMode: undefined
        })

        await expect(bootstrapSession({
            driver: 'codex',
            startedBy: 'runner',
            sessionId: 'session-existing'
        })).rejects.toThrow('Session bootstrap metadata sync failed for session-existing')
    })

    it('keeps bootstrap successful when runner notification fails', async () => {
        harness.notifyRunnerSessionStarted.mockRejectedValueOnce(new Error('runner offline'))

        const result = await bootstrapSession({
            driver: 'claude',
            startedBy: 'terminal'
        })

        expect(result.sessionInfo.id).toBe('session-new')
        expect(harness.getOrCreateSession).toHaveBeenCalledTimes(1)
    })
})
