import { describe, expect, it, vi } from 'bun:test'
import { getSessionLifecycleState } from '@viby/protocol'
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

function createEngine(): { engine: SyncEngine; store: Store } {
    const store = new Store(':memory:')
    return { store, engine: new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never) }
}

function readLifecycleState(value: unknown): string | undefined {
    return typeof value === 'object' && value !== null
        ? (value as { lifecycleState?: string }).lifecycleState
        : undefined
}

describe('session model lifecycle repair', () => {
    it('ignores late keepalive updates for closed sessions', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))
        const session = createCachedSession(cache, {
            tag: 'session-closed-late-alive',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                runtimeHandles: { codex: { sessionId: 'codex-thread-closed' } },
            },
            model: 'gpt-5.4',
        })
        const closedSession = await cache.transitionSessionLifecycle(session.id, 'closed', {
            markInactive: true,
            transitionAt: 3_000,
        })
        events.length = 0

        cache.handleSessionAlive({ sid: session.id, time: 4_000, thinking: true })

        expect(cache.getSession(session.id)).toMatchObject({
            active: false,
            thinking: false,
            metadata: { lifecycleState: 'closed', lifecycleStateSince: closedSession.metadata?.lifecycleStateSince },
        })
        expect(store.sessions.getSession(session.id)).toMatchObject({
            active: false,
            metadata: { lifecycleState: 'closed', lifecycleStateSince: closedSession.metadata?.lifecycleStateSince },
        })
        expect(events).toEqual([])
    })

    it('resumes an idle open session without moving it to history', async () => {
        const { engine, store } = createEngine()
        try {
            const session = createEngineSession(engine, {
                tag: 'session-send-open-idle',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: { codex: { sessionId: 'codex-thread-1' } },
                    lifecycleState: 'open',
                },
                model: 'gpt-5.4',
            })
            store.messages.addMessage(session.id, { role: 'assistant', content: { type: 'text', text: 'ready' } })
            engine.resumeSession = async (sessionId: string) => {
                engine.handleSessionAlive({ sid: sessionId, time: Date.now() })
                return { type: 'success' as const, sessionId }
            }

            const result = await engine.sendMessage(session.id, { text: 'wake up' })

            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toContainEqual(
                expect.objectContaining({
                    content: expect.objectContaining({
                        role: 'user',
                        content: expect.objectContaining({ text: 'wake up' }),
                    }),
                })
            )
        } finally {
            engine.stop()
        }
    })

    it('waits for runtime stopping to clear before sending and resuming an idle session', async () => {
        const { engine, store } = createEngine()
        try {
            const session = createEngineSession(engine, {
                tag: 'session-send-during-runtime-stopping',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                    runtimeHandles: { codex: { sessionId: 'codex-thread-1' } },
                    lifecycleState: 'running',
                },
                model: 'gpt-5.4',
            })
            store.messages.addMessage(session.id, { role: 'assistant', content: { type: 'text', text: 'ready' } })
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })
            engine.handleSessionRuntimeStopping(session.id, 'idle-timeout')
            const resumeSession: SyncEngine['resumeSession'] = vi.fn(async (sessionId: string) => {
                engine.handleSessionAlive({ sid: sessionId, time: Date.now(), thinking: false })
                return { type: 'success' as const, sessionId }
            })
            engine.resumeSession = resumeSession

            const sendPromise = engine.sendMessage(session.id, { text: 'after stopping' })
            await Promise.resolve()
            expect(store.messages.getMessages(session.id, 10)).toHaveLength(1)
            engine.handleSessionEnd({ sid: session.id, time: Date.now() })
            await sendPromise

            expect(resumeSession).toHaveBeenCalledWith(session.id)
            expect(store.messages.getMessages(session.id, 10)).toContainEqual(
                expect.objectContaining({
                    content: expect.objectContaining({
                        role: 'user',
                        content: expect.objectContaining({ text: 'after stopping' }),
                    }),
                })
            )
        } finally {
            engine.stop()
        }
    })

    it('keeps idle runtime stop in the open lifecycle when session-end arrives', () => {
        const { engine, store } = createEngine()
        try {
            const session = createEngineSession(engine, {
                tag: 'session-idle-runtime-stop-lifecycle',
                metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
                model: 'gpt-5.4',
            })
            const endAt = Date.now()
            engine.handleSessionAlive({ sid: session.id, time: endAt - 1_000, thinking: false })
            engine.handleSessionRuntimeStopping(session.id, 'idle-timeout')
            engine.handleSessionEnd({ sid: session.id, time: endAt })

            const stored = store.sessions.getSession(session.id)
            expect(stored?.active).toBe(false)
            expect(readLifecycleState(stored?.metadata)).toBe('open')
            expect(engine.getSession(session.id)?.metadata?.lifecycleState).toBe('open')
        } finally {
            engine.stop()
        }
    })

    it('keeps hub shutdown session-end in the open lifecycle', () => {
        const { engine, store } = createEngine()
        try {
            const session = createEngineSession(engine, {
                tag: 'session-hub-shutdown-lifecycle',
                metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
                model: 'gpt-5.4',
            })
            const endAt = Date.now()
            engine.handleSessionAlive({ sid: session.id, time: endAt - 1_000, thinking: false })
            engine.handleSessionRuntimeStopping(session.id, 'shutdown')
            engine.handleSessionEnd({ sid: session.id, time: endAt })

            const stored = store.sessions.getSession(session.id)
            expect(stored?.active).toBe(false)
            expect(readLifecycleState(stored?.metadata)).toBe('open')
            expect(engine.getSession(session.id)?.metadata?.lifecycleState).toBe('open')
        } finally {
            engine.stop()
        }
    })

    it('repairs historical inactive running durable lifecycle to open when the cache boots', () => {
        const store = new Store(':memory:')
        const stored = store.sessions.getOrCreateSession({
            tag: 'session-startup-lifecycle-repair',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex', lifecycleState: 'running' },
            model: 'gpt-5.4',
        })
        store.sessions.setSessionInactive(stored.id)
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))
        const repaired = store.sessions.getSession(stored.id)

        expect(repaired?.active).toBe(false)
        expect(readLifecycleState(repaired?.metadata)).toBe('open')
        expect(cache.refreshSession(stored.id)?.metadata?.lifecycleState).toBe('open')
    })

    it('repairs historical active history durable lifecycle when the cache boots', () => {
        const store = new Store(':memory:')
        const stored = store.sessions.getOrCreateSession({
            tag: 'session-startup-active-history-repair',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                lifecycleState: 'closed',
                lifecycleStateSince: Date.now(),
            },
            model: 'gpt-5.4',
        })
        store.sessions.setSessionAlive(stored.id, Date.now())
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))
        const repaired = store.sessions.getSession(stored.id)

        expect(repaired?.active).toBe(false)
        expect(readLifecycleState(repaired?.metadata)).toBe('open')
        expect(cache.refreshSession(stored.id)?.active).toBe(false)
    })
})
