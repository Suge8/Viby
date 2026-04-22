import { describe, expect, it } from 'bun:test'
import { getSessionResumeToken } from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import { createEngineSession, RpcRegistry, Store, SyncEngine } from './sessionModel.support.test'

describe('session model resume contracts', () => {
    it('uses the resolved driver and runtime handle when respawning a resumed session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-resume',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'gemini',
                    runtimeHandles: {
                        gemini: { sessionId: 'gemini-thread-1' },
                    },
                },
                model: 'gemini-2.5-pro',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedAgent: string | undefined
            let capturedResumeSessionId: string | undefined
            ;(engine as any).rpcGateway.spawnSession = async (options: {
                agent?: string
                resumeSessionId?: string
            }) => {
                capturedAgent = options.agent
                capturedResumeSessionId = options.resumeSessionId
                ;(engine as any).sessionCache.handleSessionAlive({
                    sid: session.id,
                    time: Date.now(),
                    thinking: false,
                })
                return { type: 'success', sessionId: session.id }
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'ready'

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(capturedAgent).toBe('gemini')
            expect(capturedResumeSessionId).toBe('gemini-thread-1')
            expect(
                (
                    store.sessions.getSession(session.id)?.metadata as {
                        lifecycleState?: string
                    } | null
                )?.lifecycleState
            ).toBe('running')
        } finally {
            engine.stop()
        }
    })

    it('returns resume_unavailable when the resolved driver has no runtime handle', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-missing-handle',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'gemini',
                    startedBy: 'terminal',
                },
                model: 'gemini-2.5-pro',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({
                type: 'error',
                message: 'Resume session ID unavailable',
                code: 'resume_unavailable',
            })
        } finally {
            engine.stop()
        }
    })

    it('resumes runner-managed history through continuity handoff when no provider runtime handle exists', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-runner-continuity-fallback',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'gemini',
                    startedBy: 'runner',
                    lifecycleState: 'closed',
                    lifecycleStateSince: Date.now(),
                },
                model: 'gemini-2.5-pro',
                permissionMode: 'default',
            })
            store.messages.addMessage(session.id, {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Resume this exact session.',
                },
            })
            store.messages.addMessage(session.id, {
                role: 'agent',
                content: {
                    type: 'text',
                    text: 'Continuity should survive without a provider token.',
                },
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let handoffBuilds = 0
            const originalBuildSessionHandoff = engine.buildSessionHandoff.bind(engine)
            ;(engine as any).buildSessionHandoff = (sessionId: string) => {
                handoffBuilds += 1
                return originalBuildSessionHandoff(sessionId)
            }

            const spawnCalls: Array<Record<string, unknown>> = []
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                engine.handleSessionAlive({
                    sid: session.id,
                    time: Date.now(),
                })
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(handoffBuilds).toBe(1)
            expect(spawnCalls).toHaveLength(1)
            expect(spawnCalls[0]?.resumeSessionId).toBeUndefined()
            expect(spawnCalls[0]?.driverSwitch).toMatchObject({
                targetDriver: 'gemini',
                handoffSnapshot: expect.objectContaining({
                    driver: 'gemini',
                    workingDirectory: '/tmp/project',
                }),
            })
        } finally {
            engine.stop()
        }
    })

    it('resumes runner-managed Copilot history through continuity after legacy handles are normalized away', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-copilot-legacy-runtime-handle',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'copilot',
                    startedBy: 'runner',
                    lifecycleState: 'closed',
                    lifecycleStateSince: Date.now(),
                },
                model: 'gpt-5',
                permissionMode: 'default',
            })
            store.messages.addMessage(session.id, {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Keep this Copilot conversation alive.',
                },
            })
            store.messages.addMessage(session.id, {
                role: 'agent',
                content: {
                    type: 'text',
                    text: 'This history should migrate onto the stable durable session id.',
                },
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            const spawnCalls: Array<Record<string, unknown>> = []
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                engine.handleSessionAlive({
                    sid: session.id,
                    time: Date.now(),
                })
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(spawnCalls).toHaveLength(1)
            expect(spawnCalls[0]?.resumeSessionId).toBeUndefined()
            expect(spawnCalls[0]?.driverSwitch).toMatchObject({
                targetDriver: 'copilot',
                handoffSnapshot: expect.objectContaining({
                    driver: 'copilot',
                    workingDirectory: '/tmp/project',
                }),
            })
        } finally {
            engine.stop()
        }
    })

    it('resumes pi sessions through transcript replay without requiring a provider runtime handle', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-pi-replay-resume',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'pi',
                    lifecycleState: 'closed',
                    lifecycleStateSince: Date.now(),
                },
                model: 'openai/gpt-5.4-mini',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            const spawnCalls: Array<Record<string, unknown>> = []
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                engine.handleSessionAlive({
                    sid: session.id,
                    time: Date.now(),
                })
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(spawnCalls).toEqual([
                {
                    sessionId: session.id,
                    machineId: 'machine-1',
                    directory: '/tmp/project',
                    agent: 'pi',
                    model: 'openai/gpt-5.4-mini',
                    modelReasoningEffort: undefined,
                    permissionMode: undefined,
                    resumeSessionId: undefined,
                    collaborationMode: undefined,
                },
            ])
        } finally {
            engine.stop()
        }
    })

    it('passes the stored model when respawning a resumed session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-model-resume',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-1' },
                    },
                },
                model: 'gpt-5.4',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedModel: string | undefined
            let capturedModelReasoningEffort: string | undefined
            let capturedPermissionMode: string | undefined
            let capturedCollaborationMode: string | undefined
            ;(engine as any).rpcGateway.spawnSession = async (options: {
                model?: string
                modelReasoningEffort?: string
                permissionMode?: string
                collaborationMode?: string
            }) => {
                capturedModel = options.model
                capturedModelReasoningEffort = options.modelReasoningEffort
                capturedPermissionMode = options.permissionMode
                capturedCollaborationMode = options.collaborationMode
                return { type: 'success', sessionId: session.id }
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'ready'

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(capturedModel).toBe('gpt-5.4')
            expect(capturedModelReasoningEffort).toBeUndefined()
            expect(capturedPermissionMode).toBeUndefined()
            expect(capturedCollaborationMode).toBeUndefined()
        } finally {
            engine.stop()
        }
    })

    it('passes the stored reasoning effort when respawning a resumed session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-model-reasoning-resume',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-2' },
                    },
                },
                model: 'gpt-5.4',
                modelReasoningEffort: 'xhigh',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedModelReasoningEffort: string | undefined
            let capturedPermissionMode: string | undefined
            let capturedCollaborationMode: string | undefined
            ;(engine as any).rpcGateway.spawnSession = async (options: {
                modelReasoningEffort?: string
                permissionMode?: string
                collaborationMode?: string
            }) => {
                capturedModelReasoningEffort = options.modelReasoningEffort
                capturedPermissionMode = options.permissionMode
                capturedCollaborationMode = options.collaborationMode
                return { type: 'success', sessionId: session.id }
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'ready'

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(capturedModelReasoningEffort).toBe('xhigh')
            expect(capturedPermissionMode).toBeUndefined()
            expect(capturedCollaborationMode).toBeUndefined()
        } finally {
            engine.stop()
        }
    })

    it('passes stored permission and collaboration mode when respawning a resumed session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-config-resume',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-3' },
                    },
                },
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedPermissionMode: string | undefined
            let capturedCollaborationMode: string | undefined
            ;(engine as any).rpcGateway.spawnSession = async (options: {
                permissionMode?: string
                collaborationMode?: string
            }) => {
                capturedPermissionMode = options.permissionMode
                capturedCollaborationMode = options.collaborationMode
                return { type: 'success', sessionId: session.id }
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'ready'

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(capturedPermissionMode).toBe('safe-yolo')
            expect(capturedCollaborationMode).toBe('plan')
        } finally {
            engine.stop()
        }
    })

    it('waits for the stored resume token before completing resume', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const original = createEngineSession(engine, {
                tag: 'session-resume-token-wait',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-old' },
                    },
                },
                model: 'gpt-5.4',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedSpawnOptions: Record<string, unknown> | null = null
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                capturedSpawnOptions = options
                return {
                    type: 'success',
                    sessionId: original.id,
                }
            }

            setTimeout(() => {
                const clearedSession = store.sessions.getSession(original.id)
                const clearedMetadata = clearedSession?.metadata
                if (
                    !clearedSession ||
                    !clearedMetadata ||
                    typeof clearedMetadata !== 'object' ||
                    Array.isArray(clearedMetadata)
                ) {
                    throw new Error('Expected original session metadata to exist')
                }
                engine.handleSessionAlive({ sid: original.id, time: Date.now() })
                store.sessions.updateSessionMetadata(
                    original.id,
                    {
                        ...(clearedMetadata as Record<string, unknown>),
                        runtimeHandles: {
                            codex: { sessionId: 'codex-thread-old' },
                        },
                    },
                    clearedSession.metadataVersion,
                    {
                        touchUpdatedAt: false,
                    }
                )
                ;((engine as any).sessionCache as { refreshSession: (sessionId: string) => void }).refreshSession(
                    original.id
                )
            }, 50)

            const result = await engine.resumeSession(original.id)

            expect(result).toEqual({ type: 'success', sessionId: original.id })
            expect(capturedSpawnOptions).toMatchObject({
                sessionId: original.id,
                resumeSessionId: 'codex-thread-old',
            })
        } finally {
            engine.stop()
        }
    })

    it('fails resume when the spawned session does not reattach the previous agent token', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const original = createEngineSession(engine, {
                tag: 'session-resume-token-check',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-old' },
                    },
                },
                model: 'gpt-5.4',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let killedSessionId: string | null = null
            ;(engine as any).rpcGateway.spawnSession = async () => ({
                type: 'success',
                sessionId: original.id,
            })
            ;(engine as any).rpcGateway.killSession = async (targetSessionId: string): Promise<void> => {
                killedSessionId = targetSessionId
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'token_mismatch'

            const result = await engine.resumeSession(original.id)

            expect(result).toEqual({
                type: 'error',
                message: 'Session failed to reattach to the previous agent session',
                code: 'resume_failed',
            })
            expect(killedSessionId).not.toBeNull()
            const killedSessionIdValue = killedSessionId
            if (killedSessionIdValue === null) {
                throw new Error('Expected killSession to be called for failed resume cleanup')
            }
            expect(killedSessionIdValue === original.id).toBe(true)
            const originalStoredSession = store.sessions.getSession(original.id)
            if (originalStoredSession === null) {
                throw new Error('Expected original session to remain after failed resume cleanup')
            }
            expect(originalStoredSession.id).toBe(original.id)
            expect(getSessionResumeToken(originalStoredSession.metadata as Session['metadata'])).toBe(
                'codex-thread-old'
            )
        } finally {
            engine.stop()
        }
    })

    it('cleans up spawned sessions when resume times out before reattachment', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const original = createEngineSession(engine, {
                tag: 'session-resume-timeout',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-old' },
                    },
                },
                model: 'gpt-5.4',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let killedSessionId: string | null = null
            ;(engine as any).rpcGateway.spawnSession = async () => ({
                type: 'success',
                sessionId: original.id,
            })
            ;(engine as any).rpcGateway.killSession = async (targetSessionId: string): Promise<void> => {
                killedSessionId = targetSessionId
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'timeout'

            const result = await engine.resumeSession(original.id)

            expect(result).toEqual({
                type: 'error',
                message: 'Session resume timed out before the previous agent session reattached',
                code: 'resume_failed',
            })
            if (killedSessionId === null) {
                throw new Error('Expected killSession to be called for timeout cleanup')
            }
            const killedSessionIdValue: string = killedSessionId
            expect(killedSessionIdValue).toBe(original.id)
            expect(
                getSessionResumeToken(
                    store.sessions.getSession(original.id)?.metadata as Session['metadata'] | undefined
                )
            ).toBe('codex-thread-old')
        } finally {
            engine.stop()
        }
    })

    it('blocks direct resume for archived sessions', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-archived-resume',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-thread-archived' },
                    },
                    lifecycleState: 'archived',
                    lifecycleStateSince: Date.now(),
                },
                model: 'gpt-5.4',
            })

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({
                type: 'error',
                message: 'Archived sessions must be restored before resuming',
                code: 'session_archived',
            })
        } finally {
            engine.stop()
        }
    })
})
