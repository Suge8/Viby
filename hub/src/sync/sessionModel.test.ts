import { describe, expect, it } from 'bun:test'
import { getSessionLifecycleState, getSessionResumeToken, toSessionSummary } from '@viby/protocol'
import type { SyncEvent } from '@viby/protocol/types'
import {
    createCachedSession,
    createEngineSession,
    createIoStub,
    createPublisher,
    RpcRegistry,
    SessionCache,
    Store,
    SyncEngine,
} from './sessionModel.support.test'

describe('session model', () => {
    it('includes explicit model and live config modes in session summaries', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-model-summary',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })

        expect(session.model).toBe('gpt-5.4')
        session.modelReasoningEffort = 'high'
        session.permissionMode = 'yolo'
        session.collaborationMode = 'plan'
        expect(toSessionSummary(session).model).toBe('gpt-5.4')
        expect(toSessionSummary(session).modelReasoningEffort).toBe('high')
        expect(toSessionSummary(session).permissionMode).toBe('yolo')
        expect(toSessionSummary(session).collaborationMode).toBe('plan')
    })

    it('preserves durable resume tokens when a session is closed', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-close-preserves-token',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                runtimeHandles: {
                    codex: { sessionId: 'codex-thread-keep' },
                },
            },
        })

        const closedSession = await cache.transitionSessionLifecycle(session.id, 'closed', {
            markInactive: true,
        })

        expect(getSessionLifecycleState(closedSession)).toBe('closed')
        expect(getSessionResumeToken(closedSession.metadata)).toBe('codex-thread-keep')
        expect(toSessionSummary(closedSession).resumeAvailable).toBe(true)
    })

    it('projects durable resume availability into session summaries', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const resumableSession = createCachedSession(cache, {
            tag: 'session-resume-available',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                runtimeHandles: {
                    codex: { sessionId: 'codex-thread-1' },
                },
            },
            model: 'gpt-5.4',
        })
        const legacySession = createCachedSession(cache, {
            tag: 'session-resume-unavailable',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })

        expect(toSessionSummary(resumableSession).resumeAvailable).toBe(true)
        expect(toSessionSummary(legacySession).resumeAvailable).toBe(false)
    })

    it('projects pi transcript replay sessions as resumable without provider runtime handles', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const piSession = createCachedSession(cache, {
            tag: 'session-pi-replay-resume',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'pi',
                lifecycleState: 'closed',
            },
            model: 'openai/gpt-5.4-mini',
        })

        expect(toSessionSummary(piSession).resumeAvailable).toBe(true)
    })

    it('projects runner-managed continuity resume sessions as resumable without durable provider tokens', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-runner-continuity-resume',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'gemini',
                startedBy: 'runner',
                lifecycleState: 'closed',
            },
            model: 'gemini-2.5-pro',
        })

        expect(toSessionSummary(session).resumeAvailable).toBe(true)
    })

    it('keeps updatedAt stable while reply chunks are still streaming', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-message-activity',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        session.updatedAt = 1_000

        const summary = toSessionSummary(session, {
            latestActivityAt: 2_000,
            latestActivityKind: 'reply',
            latestCompletedReplyAt: null,
        })

        expect(summary.updatedAt).toBe(1_000)
        expect(summary.latestActivityAt).toBe(2_000)
        expect(summary.latestActivityKind).toBe('reply')
        expect(summary.latestCompletedReplyAt).toBeNull()
    })

    it('does not treat auto summary metadata timestamps as completed reply activity', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-summary-metadata-ordering',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
                summary: {
                    text: 'Streaming title',
                    updatedAt: 6_000,
                },
            },
            model: 'sonnet',
        })
        session.updatedAt = 1_000

        const summary = toSessionSummary(session, {
            latestActivityAt: 5_000,
            latestActivityKind: 'reply',
            latestCompletedReplyAt: null,
        })

        expect(summary.updatedAt).toBe(1_000)
        expect(summary.latestActivityAt).toBe(5_000)
        expect(summary.latestActivityKind).toBe('reply')
        expect(summary.latestCompletedReplyAt).toBeNull()
    })

    it('prefers completed reply activity over stale session updatedAt in session summaries', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-completed-message-activity',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        session.updatedAt = 1_000

        const summary = toSessionSummary(session, {
            latestActivityAt: 2_001,
            latestActivityKind: 'ready',
            latestCompletedReplyAt: 2_000,
        })

        expect(summary.updatedAt).toBe(2_000)
        expect(summary.latestActivityKind).toBe('ready')
        expect(summary.latestCompletedReplyAt).toBe(2_000)
    })

    it('derives lifecycle state for closed and archived session summaries', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const closedSession = createCachedSession(cache, {
            tag: 'session-lifecycle-closed',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const archivedSession = createCachedSession(cache, {
            tag: 'session-lifecycle-archived',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })

        expect(toSessionSummary(closedSession).lifecycleState).toBe('closed')

        await cache.setSessionLifecycleState(archivedSession.id, 'archived')
        expect(toSessionSummary(cache.getSession(archivedSession.id)!)).toMatchObject({
            lifecycleState: 'archived',
        })
    })

    it('awaits lifecycle metadata writes instead of fire-and-forget updates', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        await expect(cache.setSessionLifecycleState('missing-session', 'archived')).rejects.toThrow('Session not found')
    })

    it('publishes only the final archived snapshot when archiving an active session', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-active-archive',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                runtimeHandles: {
                    codex: { sessionId: 'codex-thread-archive' },
                },
            },
            model: 'gpt-5.4',
        })

        cache.handleSessionAlive({
            sid: session.id,
            time: 2_000,
            thinking: true,
        })
        events.length = 0

        const archivedSession = await cache.transitionSessionLifecycle(session.id, 'archived', {
            markInactive: true,
            archivedBy: 'web',
            archiveReason: 'Archived by user',
            transitionAt: 3_000,
        })

        expect(archivedSession).toMatchObject({
            active: false,
            thinking: false,
            metadata: {
                lifecycleState: 'archived',
                archivedBy: 'web',
                archiveReason: 'Archived by user',
            },
        })
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            type: 'session-updated',
            sessionId: session.id,
            data: {
                active: false,
                thinking: false,
                metadata: {
                    lifecycleState: 'archived',
                },
            },
        })
    })

    it('ignores late keepalive updates for archived sessions', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-archived-late-alive',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                runtimeHandles: {
                    codex: { sessionId: 'codex-thread-archive' },
                },
            },
            model: 'gpt-5.4',
        })

        const archivedSession = await cache.transitionSessionLifecycle(session.id, 'archived', {
            markInactive: true,
            archivedBy: 'web',
            archiveReason: 'Archived by user',
            transitionAt: 3_000,
        })
        events.length = 0

        cache.handleSessionAlive({
            sid: session.id,
            time: 4_000,
            thinking: false,
        })

        expect(cache.getSession(session.id)).toMatchObject({
            active: false,
            thinking: false,
            metadata: {
                lifecycleState: 'archived',
                lifecycleStateSince: archivedSession.metadata?.lifecycleStateSince,
            },
        })
        expect(store.sessions.getSession(session.id)).toMatchObject({
            active: false,
            metadata: {
                lifecycleState: 'archived',
                lifecycleStateSince: archivedSession.metadata?.lifecycleStateSince,
            },
        })
        expect(events).toEqual([])
    })

    it('resumes a closed session inside the Hub-owned send command before persisting the user message', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-send-resume',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'gemini',
                    geminiSessionId: 'gemini-thread-1',
                },
                model: 'gemini-2.5-pro',
            })
            store.messages.addMessage(session.id, {
                role: 'assistant',
                content: {
                    type: 'text',
                    text: 'existing reply',
                },
            })

            ;(engine as any).resumeSession = async (sessionId: string) => {
                engine.handleSessionAlive({
                    sid: sessionId,
                    time: Date.now(),
                })
                return { type: 'success', sessionId }
            }

            const result = await engine.sendMessage(session.id, {
                text: 'hello after close',
                localId: 'local-1',
            })

            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toContainEqual(
                expect.objectContaining({
                    localId: 'local-1',
                    content: expect.objectContaining({
                        role: 'user',
                        content: expect.objectContaining({
                            type: 'text',
                            text: 'hello after close',
                        }),
                    }),
                })
            )
        } finally {
            engine.stop()
        }
    })

    it('auto-unarchives archived sessions inside the Hub-owned send command before resuming them', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-send-unarchive',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'gemini',
                    geminiSessionId: 'gemini-thread-2',
                },
                model: 'gemini-2.5-pro',
            })
            store.messages.addMessage(session.id, {
                role: 'assistant',
                content: {
                    type: 'text',
                    text: 'existing reply',
                },
            })

            await (engine as any).sessionCache.setSessionLifecycleState(session.id, 'archived')

            const steps: string[] = []
            const originalUnarchiveSession = engine.unarchiveSession.bind(engine)
            ;(engine as any).unarchiveSession = async (sessionId: string) => {
                steps.push('unarchive')
                return await originalUnarchiveSession(sessionId)
            }
            ;(engine as any).resumeSession = async (sessionId: string) => {
                steps.push('resume')
                engine.handleSessionAlive({
                    sid: sessionId,
                    time: Date.now(),
                })
                return { type: 'success', sessionId }
            }

            const result = await engine.sendMessage(session.id, {
                text: 'hello after archive',
            })

            expect(steps).toEqual(['unarchive', 'resume'])
            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toContainEqual(
                expect.objectContaining({
                    content: expect.objectContaining({
                        role: 'user',
                        content: expect.objectContaining({
                            type: 'text',
                            text: 'hello after archive',
                        }),
                    }),
                })
            )
        } finally {
            engine.stop()
        }
    })

    it('fresh-starts empty inactive sessions on the explicit send chain instead of requiring resume reattachment', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-send-empty-inactive',
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

            await (engine as any).sessionCache.setSessionLifecycleState(session.id, 'archived')
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
                return {
                    type: 'success',
                    sessionId: session.id,
                }
            }
            ;(engine as any).resumeSession = async () => {
                throw new Error('resumeSession should not be used for empty inactive sessions')
            }

            const result = await engine.sendMessage(session.id, {
                text: 'hello after archive without prior transcript',
            })

            expect(spawnCalls).toEqual([
                {
                    sessionId: session.id,
                    machineId: 'machine-1',
                    directory: '/tmp/project',
                    agent: 'codex',
                    model: 'gpt-5.4',
                    modelReasoningEffort: undefined,
                    permissionMode: undefined,
                    collaborationMode: undefined,
                },
            ])
            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toMatchObject([
                {
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: 'hello after archive without prior transcript',
                        },
                    },
                },
            ])
        } finally {
            engine.stop()
        }
    })

    it('switches an idle session to a new driver on the same hub session id', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-switch-success',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4',
                modelReasoningEffort: 'xhigh',
                permissionMode: 'default',
                collaborationMode: 'plan',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            let handoffBuilds = 0
            const originalBuildSessionHandoff = engine.buildSessionHandoff.bind(engine)
            ;(engine as any).buildSessionHandoff = (sessionId: string) => {
                handoffBuilds += 1
                return originalBuildSessionHandoff(sessionId)
            }

            const spawnCalls: Array<Record<string, unknown>> = []
            ;(engine as any).rpcGateway.killSession = async () => {
                engine.handleSessionEnd({ sid: session.id, time: Date.now() })
            }
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.switchSessionDriver(session.id, 'claude')

            expect(result).toMatchObject({
                type: 'success',
                targetDriver: 'claude',
                session: {
                    id: session.id,
                    active: true,
                    metadata: {
                        driver: 'claude',
                    },
                },
            })
            if (result.type !== 'success') {
                throw new Error('Expected a successful claude driver switch')
            }
            expect(result.session.collaborationMode).toBeUndefined()
            const recoveryPage = engine.getSessionRecoveryPage(session.id, { afterSeq: 0, limit: 10 })
            expect(recoveryPage.messages).toHaveLength(1)
            expect(recoveryPage.messages[0]?.content).toEqual({
                role: 'agent',
                content: {
                    type: 'event',
                    data: {
                        type: 'driver-switched',
                        previousDriver: 'codex',
                        targetDriver: 'claude',
                    },
                },
            })
            expect(handoffBuilds).toBe(1)
            expect(spawnCalls).toHaveLength(1)
            expect(spawnCalls[0]?.sessionId).toBe(session.id)
            expect(spawnCalls[0]?.machineId).toBe('machine-1')
            expect(spawnCalls[0]?.directory).toBe('/tmp/project')
            expect(spawnCalls[0]?.agent).toBe('claude')
            expect(spawnCalls[0]?.model).toBeUndefined()
            expect(spawnCalls[0]?.modelReasoningEffort).toBeNull()
            expect(spawnCalls[0]?.permissionMode).toBe('default')
            expect(spawnCalls[0]?.collaborationMode).toBeUndefined()
            expect(spawnCalls[0]?.driverSwitch).toMatchObject({
                targetDriver: 'claude',
                handoffSnapshot: {
                    driver: 'codex',
                    workingDirectory: '/tmp/project',
                    liveConfig: expect.objectContaining({
                        model: null,
                        modelReasoningEffort: null,
                        permissionMode: 'default',
                    }),
                },
            })
        } finally {
            engine.stop()
        }
    })

    it('preserves model carryover for a codex to cursor switch while sanitizing unsupported config', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-switch-cursor-config',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4-mini',
                modelReasoningEffort: 'xhigh',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            const spawnCalls: Array<Record<string, unknown>> = []
            ;(engine as any).rpcGateway.killSession = async () => {
                engine.handleSessionEnd({ sid: session.id, time: Date.now() })
            }
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.switchSessionDriver(session.id, 'cursor')

            expect(result).toMatchObject({
                type: 'success',
                targetDriver: 'cursor',
                session: {
                    id: session.id,
                    metadata: {
                        driver: 'cursor',
                    },
                    model: 'gpt-5.4-mini',
                    modelReasoningEffort: null,
                    permissionMode: 'default',
                },
            })
            if (result.type !== 'success') {
                throw new Error('Expected a successful cursor driver switch')
            }
            expect(result.session.collaborationMode).toBeUndefined()
            expect(spawnCalls).toHaveLength(1)
            expect(spawnCalls[0]).toMatchObject({
                agent: 'cursor',
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: undefined,
                driverSwitch: {
                    targetDriver: 'cursor',
                },
            })
            expect(
                (
                    spawnCalls[0]?.driverSwitch as
                        | { handoffSnapshot?: { liveConfig?: Record<string, unknown> } }
                        | undefined
                )?.handoffSnapshot?.liveConfig
            ).toEqual({
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: undefined,
            })
            const persisted = engine.getSession(session.id)
            expect(persisted).toMatchObject({
                metadata: {
                    driver: 'cursor',
                },
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
            })
            expect(persisted?.collaborationMode).toBeUndefined()
        } finally {
            engine.stop()
        }
    })

    it('sanitizes durable config during a codex to copilot switch while preserving compatible models', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-switch-copilot-config',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4-mini',
                modelReasoningEffort: 'xhigh',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            const spawnCalls: Array<Record<string, unknown>> = []
            ;(engine as any).rpcGateway.killSession = async () => {
                engine.handleSessionEnd({ sid: session.id, time: Date.now() })
            }
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.switchSessionDriver(session.id, 'copilot')

            expect(result).toMatchObject({
                type: 'success',
                targetDriver: 'copilot',
                session: {
                    id: session.id,
                    metadata: {
                        driver: 'copilot',
                    },
                    model: 'gpt-5.4-mini',
                    modelReasoningEffort: null,
                    permissionMode: 'default',
                },
            })
            if (result.type !== 'success') {
                throw new Error('Expected a successful copilot driver switch')
            }
            expect(result.session.collaborationMode).toBeUndefined()
            expect(spawnCalls).toHaveLength(1)
            expect(spawnCalls[0]).toMatchObject({
                agent: 'copilot',
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: undefined,
            })
            const persisted = engine.getSession(session.id)
            expect(persisted).toMatchObject({
                metadata: {
                    driver: 'copilot',
                },
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
            })
            expect(persisted?.collaborationMode).toBeUndefined()
        } finally {
            engine.stop()
        }
    })

    it('rejects driver switching for thinking sessions before shutdown starts', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-switch-thinking',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4',
            })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: true })

            let killCalls = 0
            let spawnCalls = 0
            ;(engine as any).rpcGateway.killSession = async () => {
                killCalls += 1
            }
            ;(engine as any).rpcGateway.spawnSession = async () => {
                spawnCalls += 1
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.switchSessionDriver(session.id, 'claude')

            expect(result).toEqual({
                type: 'error',
                message: 'Driver switching requires an idle active session',
                code: 'session_not_idle',
                stage: 'idle_gate',
                status: 409,
                targetDriver: 'claude',
                rollbackResult: 'not_started',
                session: expect.objectContaining({
                    id: session.id,
                    active: true,
                    thinking: true,
                }),
            })
            expect(killCalls).toBe(0)
            expect(spawnCalls).toBe(0)
        } finally {
            engine.stop()
        }
    })

    it('rejects same-driver switching before shutdown starts', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-switch-same-driver',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4',
            })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            let killCalls = 0
            let spawnCalls = 0
            ;(engine as any).rpcGateway.killSession = async () => {
                killCalls += 1
            }
            ;(engine as any).rpcGateway.spawnSession = async () => {
                spawnCalls += 1
                return { type: 'success', sessionId: session.id }
            }

            const result = await engine.switchSessionDriver(session.id, 'codex')

            expect(result).toEqual({
                type: 'error',
                message: 'Target driver already owns this session',
                code: 'target_driver_matches_current',
                stage: 'idle_gate',
                status: 409,
                targetDriver: 'codex',
                rollbackResult: 'not_started',
                session: expect.objectContaining({
                    id: session.id,
                    active: true,
                    thinking: false,
                    metadata: expect.objectContaining({
                        driver: 'codex',
                    }),
                }),
            })
            expect(killCalls).toBe(0)
            expect(spawnCalls).toBe(0)
        } finally {
            engine.stop()
        }
    })

    it('surfaces driver-switch marker append failures instead of reporting a clean switch', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-switch-marker-failure',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            ;(engine as any).rpcGateway.killSession = async () => {
                engine.handleSessionEnd({ sid: session.id, time: Date.now() })
            }
            ;(engine as any).rpcGateway.spawnSession = async () => {
                engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })
                return { type: 'success', sessionId: session.id }
            }

            const originalAppendDriverSwitchedEvent = (engine as any).messageService.appendDriverSwitchedEvent.bind(
                (engine as any).messageService
            )
            ;(engine as any).messageService.appendDriverSwitchedEvent = async (...args: unknown[]) => {
                void args
                throw new Error('marker append failed')
            }

            const result = await engine.switchSessionDriver(session.id, 'claude')
            const recoveryPage = engine.getSessionRecoveryPage(session.id, { afterSeq: 0, limit: 10 })

            expect(result).toEqual({
                type: 'error',
                message: 'marker append failed',
                code: 'marker_append_failed',
                stage: 'marker_append',
                status: 500,
                targetDriver: 'claude',
                rollbackResult: 'not_needed',
                session: expect.objectContaining({
                    id: session.id,
                    metadata: expect.objectContaining({ driver: 'claude' }),
                }),
            })
            expect(recoveryPage.messages).toHaveLength(0)
            ;(engine as any).messageService.appendDriverSwitchedEvent = originalAppendDriverSwitchedEvent
        } finally {
            engine.stop()
        }
    })

    it('keeps the previous driver when driver-switch spawn fails', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-driver-switch-spawn-failure',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4',
                modelReasoningEffort: 'xhigh',
                permissionMode: 'default',
                collaborationMode: 'plan',
            })
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            let capturedSpawnOptions: Record<string, unknown> | null = null
            ;(engine as any).rpcGateway.killSession = async () => {
                engine.handleSessionEnd({ sid: session.id, time: Date.now() })
            }
            ;(engine as any).rpcGateway.spawnSession = async (options: Record<string, unknown>) => {
                capturedSpawnOptions = options
                return {
                    type: 'error',
                    message: 'spawn failed',
                }
            }

            const result = await engine.switchSessionDriver(session.id, 'claude')
            const switchedSnapshot = engine.getSession(session.id)

            expect(capturedSpawnOptions).toMatchObject({
                sessionId: session.id,
                agent: 'claude',
                permissionMode: 'default',
            })
            expect(capturedSpawnOptions).not.toBeNull()
            const spawnOptions = (capturedSpawnOptions ?? {}) as {
                model?: unknown
                modelReasoningEffort?: unknown
                collaborationMode?: unknown
            }
            expect(spawnOptions.model).toBeUndefined()
            expect(spawnOptions.modelReasoningEffort).toBeNull()
            expect(spawnOptions.collaborationMode).toBeUndefined()
            expect(result).toEqual({
                type: 'error',
                message: 'spawn failed',
                code: 'spawn_failed',
                stage: 'spawn',
                status: 500,
                targetDriver: 'claude',
                rollbackResult: 'not_needed',
                session: expect.objectContaining({
                    id: session.id,
                    active: false,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'xhigh',
                    permissionMode: 'default',
                    collaborationMode: 'plan',
                    metadata: expect.objectContaining({ driver: 'codex' }),
                }),
            })
            expect(switchedSnapshot).toMatchObject({
                model: 'gpt-5.4',
                modelReasoningEffort: 'xhigh',
                permissionMode: 'default',
                collaborationMode: 'plan',
                metadata: { driver: 'codex' },
            })
        } finally {
            engine.stop()
        }
    })

    it('reuses an explicit session id instead of creating a duplicate session', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const originalSession = createCachedSession(cache, {
            tag: 'session-model-old',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const resumedSession = createCachedSession(cache, {
            tag: 'session-model-old-resume',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            sessionId: originalSession.id,
        })

        expect(resumedSession.id).toBe(originalSession.id)
        expect(cache.getSessions()).toHaveLength(1)
        expect(cache.getSession(originalSession.id)?.model).toBe('gpt-5.4')
    })

    it('renames from the latest stored metadata when the cache version is stale', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-rename-stale-version',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })

        const autoSummaryUpdate = store.sessions.updateSessionMetadata(
            session.id,
            {
                ...session.metadata,
                summary: { text: 'Auto title', updatedAt: 2_000 },
            },
            session.metadataVersion,
            { touchUpdatedAt: false }
        )

        expect(autoSummaryUpdate.result).toBe('success')

        const renamed = await cache.renameSession(session.id, 'Pinned title')

        expect(renamed.metadata).toMatchObject({
            name: 'Pinned title',
            summary: { text: 'Auto title', updatedAt: 2_000 },
        })
        expect(store.sessions.getSession(session.id)?.metadataVersion).toBe(3)
    })

    it('keeps session updatedAt stable for auto metadata updates that opt out of sorting time', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-auto-summary-stable-time',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const originalUpdatedAt = session.updatedAt

        const result = store.sessions.updateSessionMetadata(
            session.id,
            {
                ...session.metadata,
                summary: { text: 'Streaming title', updatedAt: originalUpdatedAt + 5_000 },
            },
            session.metadataVersion,
            { touchUpdatedAt: false }
        )

        expect(result.result).toBe('success')
        expect(store.sessions.getSession(session.id)?.updatedAt).toBe(originalUpdatedAt)
    })

    it('keeps session updatedAt stable for agent state writes', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-agent-state-stable-time',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            agentState: { requests: {}, completedRequests: {} },
            model: 'gpt-5.4',
        })
        const originalUpdatedAt = session.updatedAt

        const result = store.sessions.updateSessionAgentState(
            session.id,
            {
                requests: {
                    'request-1': {
                        tool: 'read_file',
                        arguments: {},
                        createdAt: originalUpdatedAt + 1_000,
                    },
                },
                completedRequests: {},
            },
            session.agentStateVersion
        )

        expect(result.result).toBe('success')
        expect(store.sessions.getSession(session.id)?.updatedAt).toBe(originalUpdatedAt)
    })

    it('keeps session updatedAt stable for derived todo projections', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-derived-projection-stable-time',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const originalUpdatedAt = session.updatedAt

        expect(
            store.sessions.setSessionTodos(
                session.id,
                [{ id: 'todo-1', content: 'Check', status: 'pending', priority: 'medium' }],
                originalUpdatedAt + 1_000
            )
        ).toBe(true)
        expect(store.sessions.getSession(session.id)?.updatedAt).toBe(originalUpdatedAt)
    })

    it('persists applied session model updates, including clear-to-auto', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-model-config',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'claude' },
            model: 'sonnet',
        })

        cache.applySessionConfig(session.id, { model: 'opus[1m]' })
        expect(cache.getSession(session.id)?.model).toBe('opus[1m]')
        expect(store.sessions.getSession(session.id)?.model).toBe('opus[1m]')

        cache.applySessionConfig(session.id, { model: null })
        expect(cache.getSession(session.id)?.model).toBeNull()
        expect(store.sessions.getSession(session.id)?.model).toBeNull()
    })

    it('persists keepalive model changes, including clearing the model', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-model-heartbeat',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'claude' },
            model: 'sonnet',
        })

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            model: null,
        })

        expect(cache.getSession(session.id)?.model).toBeNull()
        expect(store.sessions.getSession(session.id)?.model).toBeNull()
    })

    it('persists session active state across cache reloads', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-active-reload',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const aliveAt = Date.now()

        cache.handleSessionAlive({
            sid: session.id,
            time: aliveAt,
            thinking: true,
        })

        const stored = store.sessions.getSession(session.id)
        expect(stored?.active).toBe(true)
        expect(stored?.activeAt).toBe(aliveAt)

        const reloadedCache = new SessionCache(store, createPublisher([]))
        const reloadedSession = reloadedCache.refreshSession(session.id)

        expect(reloadedSession?.active).toBe(true)
        expect(reloadedSession?.activeAt).toBe(aliveAt)
    })

    it('persists inactive session state after the keepalive window expires', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-inactive-reload',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const aliveAt = Date.now()

        cache.handleSessionAlive({
            sid: session.id,
            time: aliveAt,
            thinking: false,
        })
        cache.expireInactive(aliveAt + 30_001)

        expect(cache.getSession(session.id)?.active).toBe(false)
        const stored = store.sessions.getSession(session.id)
        expect(stored?.active).toBe(false)
        expect(stored?.activeAt).toBe(aliveAt)

        const reloadedCache = new SessionCache(store, createPublisher([]))
        const reloadedSession = reloadedCache.refreshSession(session.id)

        expect(reloadedSession?.active).toBe(false)
        expect(reloadedSession?.activeAt).toBe(aliveAt)
    })

    it('preserves explicitly open lifecycle when inactivity timeout detaches the runtime', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-timeout-open-lifecycle',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const aliveAt = Date.now()

        cache.handleSessionAlive({
            sid: session.id,
            time: aliveAt,
            thinking: false,
        })
        await cache.setSessionLifecycleState(session.id, 'open', {
            touchUpdatedAt: false,
        })

        cache.expireInactive(aliveAt + 30_001)

        expect(cache.getSession(session.id)?.active).toBe(false)
        expect(cache.getSession(session.id)?.metadata?.lifecycleState).toBe('open')
        const persistedMetadata = store.sessions.getSession(session.id)?.metadata
        expect(
            persistedMetadata && typeof persistedMetadata === 'object' && 'lifecycleState' in persistedMetadata
                ? persistedMetadata.lifecycleState
                : undefined
        ).toBe('open')
    })

    it('normalizes inactive durable lifecycle to closed when a session ends naturally', () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-natural-end-lifecycle',
                metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
                model: 'gpt-5.4',
            })
            const endAt = Date.now()

            engine.handleSessionAlive({
                sid: session.id,
                time: endAt - 1_000,
                thinking: false,
            })
            engine.handleSessionEnd({
                sid: session.id,
                time: endAt,
            })

            const stored = store.sessions.getSession(session.id)
            expect(stored?.active).toBe(false)
            expect((stored?.metadata as { lifecycleState?: string } | null)?.lifecycleState).toBe('closed')
            expect(engine.getSession(session.id)?.metadata?.lifecycleState).toBe('closed')
        } finally {
            engine.stop()
        }
    })

    it('preserves explicitly open lifecycle when an aborted session later reports inactive', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-abort-open-lifecycle',
                metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
                model: 'gpt-5.4',
            })
            const endAt = Date.now()

            engine.handleSessionAlive({
                sid: session.id,
                time: endAt - 1_000,
                thinking: true,
            })

            await (
                engine as unknown as { syncServices: { sessionCache: SessionCache } }
            ).syncServices.sessionCache.setSessionLifecycleState(session.id, 'open', {
                touchUpdatedAt: false,
            })

            engine.handleSessionEnd({
                sid: session.id,
                time: endAt,
            })

            const stored = store.sessions.getSession(session.id)
            expect(stored?.active).toBe(false)
            expect((stored?.metadata as { lifecycleState?: string } | null)?.lifecycleState).toBe('open')
            expect(engine.getSession(session.id)?.metadata?.lifecycleState).toBe('open')
        } finally {
            engine.stop()
        }
    })

    it('repairs historical inactive running durable lifecycle when the cache boots', () => {
        const store = new Store(':memory:')
        const stored = store.sessions.getOrCreateSession({
            tag: 'session-startup-lifecycle-repair',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                lifecycleState: 'running',
                lifecycleStateSince: Date.now(),
            },
            model: 'gpt-5.4',
        })

        store.sessions.setSessionInactive(stored.id)

        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))
        const repaired = store.sessions.getSession(stored.id)

        expect(repaired?.active).toBe(false)
        expect((repaired?.metadata as { lifecycleState?: string } | null)?.lifecycleState).toBe('closed')
        expect(cache.refreshSession(stored.id)?.metadata?.lifecycleState).toBe('closed')
    })

    it('refreshes cached sessions from durable inactive state instead of preserving stale active memory', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-refresh-durable-inactive',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const aliveAt = Date.now()

        cache.handleSessionAlive({
            sid: session.id,
            time: aliveAt,
            thinking: true,
        })
        store.sessions.setSessionInactive(session.id)

        const refreshedSession = cache.refreshSession(session.id)

        expect(refreshedSession?.active).toBe(false)
        expect(refreshedSession?.thinking).toBe(false)
        expect(refreshedSession?.activeAt).toBe(aliveAt)
    })

    it('strips data-url attachment previews from durable user messages and legacy message reads', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-attachment-preview-sanitize',
                metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
                model: 'gpt-5.4',
            })

            engine.handleSessionAlive({
                sid: session.id,
                time: Date.now(),
                thinking: false,
            })

            await engine.sendMessage(session.id, {
                text: 'photo',
                attachments: [
                    {
                        id: 'attachment-1',
                        filename: 'photo.png',
                        mimeType: 'image/png',
                        size: 123,
                        path: '/tmp/photo.png',
                        previewUrl: 'data:image/png;base64,abc',
                    },
                ],
            })

            store.messages.addMessage(session.id, {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'legacy photo',
                    attachments: [
                        {
                            id: 'attachment-legacy',
                            filename: 'legacy.png',
                            mimeType: 'image/png',
                            size: 456,
                            path: '/tmp/legacy.png',
                            previewUrl: 'data:image/png;base64,legacy',
                        },
                    ],
                },
            })

            const storedMessages = store.messages.getMessages(session.id, 10)
            const sentMessage = storedMessages.find((message) => {
                return (message.content as { content?: { text?: string } })?.content?.text === 'photo'
            })
            expect(
                (
                    sentMessage?.content as {
                        content?: { attachments?: Array<{ previewUrl?: string }> }
                    }
                )?.content?.attachments?.[0]?.previewUrl
            ).toBeUndefined()

            const page = engine.getMessagesPage(session.id, { limit: 10, beforeSeq: null })
            const legacyMessage = page.messages.find((message) => {
                return (message.content as { content?: { text?: string } })?.content?.text === 'legacy photo'
            })
            expect(
                (
                    legacyMessage?.content as {
                        content?: { attachments?: Array<{ previewUrl?: string }> }
                    }
                )?.content?.attachments?.[0]?.previewUrl
            ).toBeUndefined()
        } finally {
            engine.stop()
        }
    })

    it('tracks collaboration mode updates in memory from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-collaboration-mode',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })

        cache.applySessionConfig(session.id, { collaborationMode: 'plan' })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('plan')
        expect(store.sessions.getSession(session.id)?.collaborationMode).toBe('plan')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            collaborationMode: 'default',
        })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('default')
        expect(store.sessions.getSession(session.id)?.collaborationMode).toBe('default')
    })

    it('persists permission mode updates from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-permission-mode',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })

        cache.applySessionConfig(session.id, { permissionMode: 'read-only' })
        expect(cache.getSession(session.id)?.permissionMode).toBe('read-only')
        expect(store.sessions.getSession(session.id)?.permissionMode).toBe('read-only')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            permissionMode: 'safe-yolo',
        })
        expect(cache.getSession(session.id)?.permissionMode).toBe('safe-yolo')
        expect(store.sessions.getSession(session.id)?.permissionMode).toBe('safe-yolo')
    })

    it('persists model reasoning effort updates from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = createCachedSession(cache, {
            tag: 'session-model-reasoning-effort',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
        })

        cache.applySessionConfig(session.id, { modelReasoningEffort: 'xhigh' })
        expect(cache.getSession(session.id)?.modelReasoningEffort).toBe('xhigh')
        expect(store.sessions.getSession(session.id)?.modelReasoningEffort).toBe('xhigh')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            modelReasoningEffort: null,
        })
        expect(cache.getSession(session.id)?.modelReasoningEffort).toBeNull()
        expect(store.sessions.getSession(session.id)?.modelReasoningEffort).toBeNull()
    })
})
