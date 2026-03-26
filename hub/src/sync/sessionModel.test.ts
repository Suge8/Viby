import { describe, expect, it } from 'bun:test'
import { getSessionLifecycleState, toSessionSummary } from '@viby/protocol'
import type { SyncEvent } from '@viby/protocol/types'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import type { EventPublisher } from './eventPublisher'
import { SessionCache } from './sessionCache'
import { SyncEngine } from './syncEngine'

function createPublisher(events: SyncEvent[]): EventPublisher {
    return {
        emit: (event: SyncEvent) => {
            events.push(event)
        }
    } as unknown as EventPublisher
}

function createIoStub(): Server {
    return {
        of() {
            return {
                to() {
                    return {
                        emit() {
                        }
                    }
                }
            }
        }
    } as unknown as Server
}

describe('session model', () => {
    it('includes explicit model and live config modes in session summaries', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-summary',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )

        expect(session.model).toBe('gpt-5.4')
        session.modelReasoningEffort = 'high'
        session.permissionMode = 'yolo'
        session.collaborationMode = 'plan'
        expect(toSessionSummary(session).model).toBe('gpt-5.4')
        expect(toSessionSummary(session).modelReasoningEffort).toBe('high')
        expect(toSessionSummary(session).permissionMode).toBe('yolo')
        expect(toSessionSummary(session).collaborationMode).toBe('plan')
    })

    it('projects durable resume availability into session summaries', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const resumableSession = cache.getOrCreateSession(
            'session-resume-available',
            {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-thread-1'
            },
            null,
            'gpt-5.4'
        )
        const legacySession = cache.getOrCreateSession(
            'session-resume-unavailable',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )

        expect(toSessionSummary(resumableSession).resumeAvailable).toBe(true)
        expect(toSessionSummary(legacySession).resumeAvailable).toBe(false)
    })

    it('keeps updatedAt stable while reply chunks are still streaming', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-message-activity',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        session.updatedAt = 1_000

        const summary = toSessionSummary(session, {
            latestActivityAt: 2_000,
            latestActivityKind: 'reply',
            latestCompletedReplyAt: null
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

        const session = cache.getOrCreateSession(
            'session-summary-metadata-ordering',
            {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude',
                summary: {
                    text: 'Streaming title',
                    updatedAt: 6_000
                }
            },
            null,
            'sonnet'
        )
        session.updatedAt = 1_000

        const summary = toSessionSummary(session, {
            latestActivityAt: 5_000,
            latestActivityKind: 'reply',
            latestCompletedReplyAt: null
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

        const session = cache.getOrCreateSession(
            'session-completed-message-activity',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        session.updatedAt = 1_000

        const summary = toSessionSummary(session, {
            latestActivityAt: 2_001,
            latestActivityKind: 'ready',
            latestCompletedReplyAt: 2_000
        })

        expect(summary.updatedAt).toBe(2_000)
        expect(summary.latestActivityKind).toBe('ready')
        expect(summary.latestCompletedReplyAt).toBe(2_000)
    })

    it('derives lifecycle state for closed and archived session summaries', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const closedSession = cache.getOrCreateSession(
            'session-lifecycle-closed',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        const archivedSession = cache.getOrCreateSession(
            'session-lifecycle-archived',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )

        expect(toSessionSummary(closedSession).lifecycleState).toBe('closed')

        await cache.setSessionLifecycleState(archivedSession.id, 'archived')
        expect(toSessionSummary(cache.getSession(archivedSession.id)!)).toMatchObject({
            lifecycleState: 'archived'
        })
    })

    it('publishes only the final archived snapshot when archiving an active session', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-active-archive',
            {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-thread-archive'
            },
            null,
            'gpt-5.4'
        )

        cache.handleSessionAlive({
            sid: session.id,
            time: 2_000,
            thinking: true
        })
        events.length = 0

        const archivedSession = await cache.transitionSessionLifecycle(session.id, 'archived', {
            markInactive: true,
            archivedBy: 'web',
            archiveReason: 'Archived by user',
            transitionAt: 3_000
        })

        expect(archivedSession).toMatchObject({
            active: false,
            thinking: false,
            metadata: {
                lifecycleState: 'archived',
                archivedBy: 'web',
                archiveReason: 'Archived by user'
            }
        })
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            type: 'session-updated',
            sessionId: session.id,
            data: {
                active: false,
                thinking: false,
                metadata: {
                    lifecycleState: 'archived'
                }
            }
        })
    })

    it('ignores late keepalive updates for archived sessions', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-archived-late-alive',
            {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-thread-archive'
            },
            null,
            'gpt-5.4'
        )

        const archivedSession = await cache.transitionSessionLifecycle(session.id, 'archived', {
            markInactive: true,
            archivedBy: 'web',
            archiveReason: 'Archived by user',
            transitionAt: 3_000
        })
        events.length = 0

        cache.handleSessionAlive({
            sid: session.id,
            time: 4_000,
            thinking: false
        })

        expect(cache.getSession(session.id)).toMatchObject({
            active: false,
            thinking: false,
            metadata: {
                lifecycleState: 'archived',
                lifecycleStateSince: archivedSession.metadata?.lifecycleStateSince
            }
        })
        expect(store.sessions.getSession(session.id)).toMatchObject({
            active: false,
            metadata: {
                lifecycleState: 'archived',
                lifecycleStateSince: archivedSession.metadata?.lifecycleStateSince
            }
        })
        expect(events).toEqual([])
    })

    it('resumes a closed session inside the Hub-owned send command before persisting the user message', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            createIoStub(),
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-send-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'gemini',
                    geminiSessionId: 'gemini-thread-1'
                },
                null,
                'gemini-2.5-pro'
            )
            store.messages.addMessage(session.id, {
                role: 'assistant',
                content: {
                    type: 'text',
                    text: 'existing reply'
                }
            })

            ;(engine as any).resumeSession = async (sessionId: string) => {
                engine.handleSessionAlive({
                    sid: sessionId,
                    time: Date.now()
                })
                return { type: 'success', sessionId }
            }

            const result = await engine.sendMessage(session.id, {
                text: 'hello after close',
                localId: 'local-1'
            })

            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toContainEqual(expect.objectContaining({
                localId: 'local-1',
                content: expect.objectContaining({
                    role: 'user',
                    content: expect.objectContaining({
                        type: 'text',
                        text: 'hello after close'
                    })
                })
            }))
        } finally {
            engine.stop()
        }
    })

    it('auto-unarchives archived sessions inside the Hub-owned send command before resuming them', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            createIoStub(),
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-send-unarchive',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'gemini',
                    geminiSessionId: 'gemini-thread-2'
                },
                null,
                'gemini-2.5-pro'
            )
            store.messages.addMessage(session.id, {
                role: 'assistant',
                content: {
                    type: 'text',
                    text: 'existing reply'
                }
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
                    time: Date.now()
                })
                return { type: 'success', sessionId }
            }

            const result = await engine.sendMessage(session.id, {
                text: 'hello after archive'
            })

            expect(steps).toEqual(['unarchive', 'resume'])
            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toContainEqual(expect.objectContaining({
                content: expect.objectContaining({
                    role: 'user',
                    content: expect.objectContaining({
                        type: 'text',
                        text: 'hello after archive'
                    })
                })
            }))
        } finally {
            engine.stop()
        }
    })

    it('fresh-starts empty inactive sessions on the explicit send chain instead of requiring resume reattachment', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            createIoStub(),
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-send-empty-inactive',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-old'
                },
                null,
                'gpt-5.4'
            )

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
                    time: Date.now()
                })
                return {
                    type: 'success',
                    sessionId: session.id
                }
            }
            ;(engine as any).resumeSession = async () => {
                throw new Error('resumeSession should not be used for empty inactive sessions')
            }

            const result = await engine.sendMessage(session.id, {
                text: 'hello after archive without prior transcript'
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
                    collaborationMode: undefined
                }
            ])
            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toMatchObject([
                {
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: 'hello after archive without prior transcript'
                        }
                    }
                }
            ])
        } finally {
            engine.stop()
        }
    })

    it('waits for the remote switch owner contract before resolving the switched session snapshot', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            createIoStub(),
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-switch-remote',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex'
                },
                {
                    controlledByUser: true,
                    requests: {},
                    completedRequests: {}
                },
                'gpt-5.4'
            )
            engine.handleSessionAlive({
                sid: session.id,
                time: Date.now(),
                mode: 'local'
            })

            ;(engine as any).rpcGateway.switchSession = async () => {
                setTimeout(() => {
                    const storedSession = store.sessions.getSession(session.id)
                    if (!storedSession) {
                        throw new Error('Expected stored session to exist during switch test')
                    }
                    store.sessions.updateSessionAgentState(
                        session.id,
                        {
                            controlledByUser: false,
                            requests: {},
                            completedRequests: {}
                        },
                        storedSession.agentStateVersion
                    )
                    ;((engine as any).sessionCache as { refreshSession: (sessionId: string) => void }).refreshSession(session.id)
                }, 20)
            }

            const switchedSession = await engine.switchSession(session.id, 'remote')

            expect(switchedSession.agentState?.controlledByUser).toBe(false)
            expect(switchedSession.active).toBe(true)
        } finally {
            engine.stop()
        }
    })

    it('reuses an explicit session id instead of creating a duplicate session', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const originalSession = cache.getOrCreateSession(
            'session-model-old',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        const resumedSession = cache.getOrCreateSession(
            'session-model-old-resume',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            undefined,
            undefined,
            undefined,
            undefined,
            originalSession.id
        )

        expect(resumedSession.id).toBe(originalSession.id)
        expect(cache.getSessions()).toHaveLength(1)
        expect(cache.getSession(originalSession.id)?.model).toBe('gpt-5.4')
    })

    it('renames from the latest stored metadata when the cache version is stale', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-rename-stale-version',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )

        const autoSummaryUpdate = store.sessions.updateSessionMetadata(
            session.id,
            {
                ...session.metadata,
                summary: { text: 'Auto title', updatedAt: 2_000 }
            },
            session.metadataVersion,
            { touchUpdatedAt: false }
        )

        expect(autoSummaryUpdate.result).toBe('success')

        const renamed = await cache.renameSession(session.id, 'Pinned title')

        expect(renamed.metadata).toMatchObject({
            name: 'Pinned title',
            summary: { text: 'Auto title', updatedAt: 2_000 }
        })
        expect(store.sessions.getSession(session.id)?.metadataVersion).toBe(3)
    })

    it('keeps session updatedAt stable for auto metadata updates that opt out of sorting time', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-auto-summary-stable-time',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        const originalUpdatedAt = session.updatedAt

        const result = store.sessions.updateSessionMetadata(
            session.id,
            {
                ...session.metadata,
                summary: { text: 'Streaming title', updatedAt: originalUpdatedAt + 5_000 }
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

        const session = cache.getOrCreateSession(
            'session-agent-state-stable-time',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            { requests: {}, completedRequests: {} },
            'gpt-5.4'
        )
        const originalUpdatedAt = session.updatedAt

        const result = store.sessions.updateSessionAgentState(
            session.id,
            {
                requests: {
                    'request-1': {
                        tool: 'read_file',
                        arguments: {},
                        createdAt: originalUpdatedAt + 1_000
                    }
                },
                completedRequests: {}
            },
            session.agentStateVersion
        )

        expect(result.result).toBe('success')
        expect(store.sessions.getSession(session.id)?.updatedAt).toBe(originalUpdatedAt)
    })

    it('keeps session updatedAt stable for derived todo and team-state projections', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-derived-projection-stable-time',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        const originalUpdatedAt = session.updatedAt

        expect(store.sessions.setSessionTodos(session.id, [{ id: 'todo-1', content: 'Check', status: 'pending', priority: 'medium' }], originalUpdatedAt + 1_000)).toBe(true)
        expect(store.sessions.getSession(session.id)?.updatedAt).toBe(originalUpdatedAt)

        expect(store.sessions.setSessionTeamState(session.id, { teamName: 'alpha', updatedAt: originalUpdatedAt + 2_000 }, originalUpdatedAt + 2_000)).toBe(true)
        expect(store.sessions.getSession(session.id)?.updatedAt).toBe(originalUpdatedAt)
    })

    it('persists applied session model updates, including clear-to-auto', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-config',
            { path: '/tmp/project', host: 'localhost', flavor: 'claude' },
            null,
            'sonnet'
        )

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

        const session = cache.getOrCreateSession(
            'session-model-heartbeat',
            { path: '/tmp/project', host: 'localhost', flavor: 'claude' },
            null,
            'sonnet'
        )

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            model: null
        })

        expect(cache.getSession(session.id)?.model).toBeNull()
        expect(store.sessions.getSession(session.id)?.model).toBeNull()
    })

    it('persists session active state across cache reloads', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-active-reload',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        const aliveAt = Date.now()

        cache.handleSessionAlive({
            sid: session.id,
            time: aliveAt,
            thinking: true
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

        const session = cache.getOrCreateSession(
            'session-inactive-reload',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )
        const aliveAt = Date.now()

        cache.handleSessionAlive({
            sid: session.id,
            time: aliveAt,
            thinking: false
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

    it('tracks collaboration mode updates in memory from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-collaboration-mode',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )

        cache.applySessionConfig(session.id, { collaborationMode: 'plan' })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('plan')
        expect(store.sessions.getSession(session.id)?.collaborationMode).toBe('plan')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            collaborationMode: 'default'
        })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('default')
        expect(store.sessions.getSession(session.id)?.collaborationMode).toBe('default')
    })

    it('persists permission mode updates from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-permission-mode',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4'
        )

        cache.applySessionConfig(session.id, { permissionMode: 'read-only' })
        expect(cache.getSession(session.id)?.permissionMode).toBe('read-only')
        expect(store.sessions.getSession(session.id)?.permissionMode).toBe('read-only')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            permissionMode: 'safe-yolo'
        })
        expect(cache.getSession(session.id)?.permissionMode).toBe('safe-yolo')
        expect(store.sessions.getSession(session.id)?.permissionMode).toBe('safe-yolo')
    })

    it('persists model reasoning effort updates from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-reasoning-effort',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'gpt-5.4',
            'high'
        )

        cache.applySessionConfig(session.id, { modelReasoningEffort: 'xhigh' })
        expect(cache.getSession(session.id)?.modelReasoningEffort).toBe('xhigh')
        expect(store.sessions.getSession(session.id)?.modelReasoningEffort).toBe('xhigh')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            modelReasoningEffort: null
        })
        expect(cache.getSession(session.id)?.modelReasoningEffort).toBeNull()
        expect(store.sessions.getSession(session.id)?.modelReasoningEffort).toBeNull()
    })

    it('passes the stored model when respawning a resumed session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-model-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-1'
                },
                null,
                'gpt-5.4'
            )
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
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-model-reasoning-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-2'
                },
                null,
                'gpt-5.4',
                'xhigh'
            )
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
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-config-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-3'
                },
                null,
                'gpt-5.4',
                'high',
                'safe-yolo',
                'plan'
            )
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
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const original = engine.getOrCreateSession(
                'session-resume-token-wait',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-old'
                },
                null,
                'gpt-5.4'
            )
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
                    sessionId: original.id
                }
            }

            setTimeout(() => {
                const clearedSession = store.sessions.getSession(original.id)
                const clearedMetadata = clearedSession?.metadata
                if (!clearedSession || !clearedMetadata || typeof clearedMetadata !== 'object' || Array.isArray(clearedMetadata)) {
                    throw new Error('Expected original session metadata to exist')
                }
                engine.handleSessionAlive({ sid: original.id, time: Date.now() })
                store.sessions.updateSessionMetadata(original.id, {
                    ...(clearedMetadata as Record<string, unknown>),
                    codexSessionId: 'codex-thread-old'
                }, clearedSession.metadataVersion, {
                    touchUpdatedAt: false
                })
                ;((engine as any).sessionCache as { refreshSession: (sessionId: string) => void }).refreshSession(original.id)
            }, 50)

            const result = await engine.resumeSession(original.id)

            expect(result).toEqual({ type: 'success', sessionId: original.id })
            expect(capturedSpawnOptions).toMatchObject({
                sessionId: original.id,
                resumeSessionId: 'codex-thread-old'
            })
        } finally {
            engine.stop()
        }
    })

    it('fails resume when the spawned session does not reattach the previous agent token', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const original = engine.getOrCreateSession(
                'session-resume-token-check',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-old'
                },
                null,
                'gpt-5.4'
            )
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let killedSessionId: string | null = null
            ;(engine as any).rpcGateway.spawnSession = async () => ({
                type: 'success',
                sessionId: original.id
            })
            ;(engine as any).rpcGateway.killSession = async (targetSessionId: string): Promise<void> => {
                killedSessionId = targetSessionId
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'token_mismatch'

            const result = await engine.resumeSession(original.id)

            expect(result).toEqual({
                type: 'error',
                message: 'Session failed to reattach to the previous agent session',
                code: 'resume_failed'
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
            expect((originalStoredSession.metadata as { codexSessionId?: string }).codexSessionId).toBe('codex-thread-old')
        } finally {
            engine.stop()
        }
    })

    it('cleans up spawned sessions when resume times out before reattachment', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const original = engine.getOrCreateSession(
                'session-resume-timeout',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-old'
                },
                null,
                'gpt-5.4'
            )
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let killedSessionId: string | null = null
            ;(engine as any).rpcGateway.spawnSession = async () => ({
                type: 'success',
                sessionId: original.id
            })
            ;(engine as any).rpcGateway.killSession = async (targetSessionId: string): Promise<void> => {
                killedSessionId = targetSessionId
            }
            ;(engine as any).waitForResumedSessionContract = async () => 'timeout'

            const result = await engine.resumeSession(original.id)

            expect(result).toEqual({
                type: 'error',
                message: 'Session resume timed out before the previous agent session reattached',
                code: 'resume_failed'
            })
            if (killedSessionId === null) {
                throw new Error('Expected killSession to be called for timeout cleanup')
            }
            const killedSessionIdValue: string = killedSessionId
            expect(killedSessionIdValue).toBe(original.id)
            expect((store.sessions.getSession(original.id)?.metadata as { codexSessionId?: string }).codexSessionId).toBe('codex-thread-old')
        } finally {
            engine.stop()
        }
    })

    it('blocks direct resume for archived sessions', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-archived-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-archived',
                    lifecycleState: 'archived',
                    lifecycleStateSince: Date.now()
                },
                null,
                'gpt-5.4'
            )

            const result = await engine.resumeSession(session.id)

            expect(result).toEqual({
                type: 'error',
                message: 'Archived sessions must be restored before resuming',
                code: 'session_archived'
            })
        } finally {
            engine.stop()
        }
    })
})
