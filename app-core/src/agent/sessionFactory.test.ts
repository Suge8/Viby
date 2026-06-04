import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { harness, sessionClientState } = vi.hoisted(() => {
    const state = {
        metadata: null as Record<string, unknown> | null,
        updateMetadataAndWait: vi.fn(
            async (handler: (metadata: Record<string, unknown>) => Record<string, unknown>) => {
                const current = state.metadata ?? {}
                state.metadata = handler(current)
            }
        ),
        getMetadataSnapshot: vi.fn(() => state.metadata),
    }

    return {
        sessionClientState: state,
        harness: {
            getOrCreateMachine: vi.fn(async () => ({
                id: 'machine-1',
                metadata: null,
                metadataVersion: 0,
                runtimeState: null,
                runtimeStateVersion: 0,
                seq: 0,
                createdAt: 0,
                updatedAt: 0,
                active: true,
                activeAt: 0,
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
                collaborationMode: undefined,
            })),
            connectRpcHandlers: vi.fn(),
            readSettings: vi.fn(async () => ({ machineId: 'machine-1' })),
        },
    }
})

vi.mock('@/api/api', () => ({
    ApiClient: {
        create: vi.fn(async () => ({
            getOrCreateMachine: harness.getOrCreateMachine,
            getOrCreateSession: harness.getOrCreateSession,
        })),
    },
}))

vi.mock('@/api/providerAdapterSessionClient', () => ({
    ProviderAdapterSessionClient: class {
        connectRpcHandlers = harness.connectRpcHandlers
        constructor(sessionInfo: { metadata?: Record<string, unknown> | null }) {
            sessionClientState.metadata = (sessionInfo.metadata ?? null) as Record<string, unknown> | null
        }
        getMetadataSnapshot = sessionClientState.getMetadataSnapshot
        updateMetadataAndWait = sessionClientState.updateMetadataAndWait
        on() {}
        onUserMessage() {}
    },
}))

vi.mock('@/persistence', () => ({
    readSettings: harness.readSettings,
}))

vi.mock('@/configuration', () => ({
    configuration: {
        vibyHomeDir: '/tmp/viby-home',
    },
}))

vi.mock('@/projectPath', () => ({
    runtimePath: () => '/tmp/viby-lib',
}))

vi.mock('@/utils/invokedCwd', () => ({
    getInvokedCwd: () => '/tmp/project',
}))

vi.mock('@/utils/worktreeEnv', () => ({
    readWorktreeEnv: () => null,
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

import {
    PROVIDER_ADAPTER_EVENT_SESSION_STARTED,
    PROVIDER_ADAPTER_EVENTS_STDOUT_ENV,
} from '@/runtime/providerAdapterProtocol'
import { bootstrapSession } from './sessionFactory'

let writeStdout: ReturnType<typeof vi.spyOn>

describe('bootstrapSession', () => {
    beforeEach(() => {
        delete process.env.VIBY_MACHINE_ID
        delete process.env.VIBY_HOSTNAME
        process.env[PROVIDER_ADAPTER_EVENTS_STDOUT_ENV] = '1'
        sessionClientState.metadata = null
        sessionClientState.updateMetadataAndWait.mockClear()
        sessionClientState.getMetadataSnapshot.mockClear()
        harness.getOrCreateMachine.mockClear()
        harness.getOrCreateSession.mockClear()
        harness.connectRpcHandlers.mockClear()
        harness.readSettings.mockClear()
        harness.readSettings.mockResolvedValue({ machineId: 'machine-1' })
        writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
        writeStdout.mockRestore()
    })

    it('persists authoritative driver metadata for new sessions', async () => {
        await bootstrapSession({
            driver: 'codex',
            startedBy: 'app-core',
        })

        expect(harness.getOrCreateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    driver: 'codex',
                    path: '/tmp/project',
                    startedBy: 'app-core',
                }),
            })
        )
        expect(harness.getOrCreateMachine).not.toHaveBeenCalled()
    })

    it('reuses an injected machine id without reading settings again', async () => {
        process.env.VIBY_MACHINE_ID = 'machine-from-app-core-env'

        await bootstrapSession({
            driver: 'codex',
            startedBy: 'app-core',
        })

        expect(harness.readSettings).not.toHaveBeenCalled()
        expect(harness.getOrCreateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    machineId: 'machine-from-app-core-env',
                }),
            })
        )
    })

    it('uses the configured Viby hostname for session metadata', async () => {
        process.env.VIBY_HOSTNAME = 'custom-session-host'

        await bootstrapSession({
            driver: 'codex',
            startedBy: 'app-core',
        })

        expect(harness.getOrCreateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    host: 'custom-session-host',
                }),
            })
        )
    })

    it('forwards an explicit viby session id into session bootstrap without inventing runtime handles', async () => {
        const result = await bootstrapSession({
            driver: 'codex',
            startedBy: 'app-core',
            sessionId: '11111111-1111-4111-8111-111111111111',
        })

        expect(harness.getOrCreateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: '11111111-1111-4111-8111-111111111111',
                metadata: expect.objectContaining({
                    driver: 'codex',
                }),
            })
        )
        expect(result.sessionInfo.id).toBe('11111111-1111-4111-8111-111111111111')
        const event = JSON.parse(String(writeStdout.mock.calls[0]?.[0]).trim()) as {
            type: string
            metadata: { runtimeHandles?: unknown }
        }
        expect(event.type).toBe(PROVIDER_ADAPTER_EVENT_SESSION_STARTED)
        expect(event.metadata).toEqual(
            expect.objectContaining({
                path: '/tmp/project',
                startedBy: 'app-core',
                driver: 'codex',
            })
        )
        expect('runtimeHandles' in event.metadata).toBe(false)
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
                    claude: { sessionId: 'claude-thread-1' },
                },
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
            collaborationMode: undefined,
        })

        const result = await bootstrapSession({
            driver: 'codex',
            startedBy: 'app-core',
            sessionId: 'session-existing',
        })

        expect(sessionClientState.updateMetadataAndWait).toHaveBeenCalledTimes(1)
        expect(result.metadata).toEqual(
            expect.objectContaining({
                driver: 'codex',
                runtimeHandles: {
                    claude: { sessionId: 'claude-thread-1' },
                },
            })
        )
    })

    it('reuses switch-finalized metadata without re-running durable sync for driver-switch bootstrap', async () => {
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
                    claude: { sessionId: 'claude-thread-1' },
                },
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
            collaborationMode: undefined,
        })

        const result = await bootstrapSession({
            driver: 'codex',
            startedBy: 'app-core',
            sessionId: 'session-existing',
            driverSwitchBootstrap: true,
        })

        expect(sessionClientState.updateMetadataAndWait).not.toHaveBeenCalled()
        expect(result.metadata).toEqual(
            expect.objectContaining({
                driver: 'codex',
                runtimeHandles: {
                    claude: { sessionId: 'claude-thread-1' },
                },
            })
        )
    })

    it('fails bootstrap explicitly when reused-session metadata sync does not converge the target driver', async () => {
        sessionClientState.updateMetadataAndWait.mockImplementationOnce(async () => {
            sessionClientState.metadata = {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
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
                driver: 'claude',
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
            collaborationMode: undefined,
        })

        await expect(
            bootstrapSession({
                driver: 'codex',
                startedBy: 'app-core',
                sessionId: 'session-existing',
            })
        ).rejects.toThrow('Session bootstrap metadata sync failed for session-existing')
    })

    it('fails bootstrap outside the provider adapter stdout protocol', async () => {
        delete process.env[PROVIDER_ADAPTER_EVENTS_STDOUT_ENV]

        await expect(
            bootstrapSession({
                driver: 'claude',
                startedBy: 'terminal',
            })
        ).rejects.toThrow(`${PROVIDER_ADAPTER_EVENTS_STDOUT_ENV}=1 is required for AppCore provider sessions`)
    })
})
