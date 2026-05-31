import { describe, expect, it } from 'bun:test'
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

describe('session presence sweep', () => {
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

        cache.handleSessionAlive({ sid: session.id, time: aliveAt, thinking: false })
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

    it('does not let a stale inactivity sweep overwrite a newer durable keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))
        const session = createCachedSession(cache, {
            tag: 'session-sweep-stale-keepalive',
            metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
            model: 'gpt-5.4',
        })
        const aliveAt = Date.now()
        const newerAliveAt = aliveAt + 40_000

        cache.handleSessionAlive({ sid: session.id, time: aliveAt, thinking: false })
        store.sessions.setSessionAlive(session.id, newerAliveAt)
        cache.expireInactive(aliveAt + 30_001)

        expect(cache.getSession(session.id)?.active).toBe(true)
        const stored = store.sessions.getSession(session.id)
        expect(stored?.active).toBe(true)
        expect(stored?.activeAt).toBe(newerAliveAt)
    })

    it('drives inactivity sweep through the injected scheduler and clock', () => {
        const store = new Store(':memory:')
        let now = 10_000
        const scheduled: Array<{ callback: () => void; cancelled: boolean; intervalMs: number }> = []
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never, {
            now: () => now,
            scheduleInterval: (callback, intervalMs) => {
                const entry = { callback, cancelled: false, intervalMs }
                scheduled.push(entry)
                return () => {
                    entry.cancelled = true
                }
            },
        })

        try {
            const session = createEngineSession(engine, {
                tag: 'session-injected-sweep',
                metadata: { path: '/tmp/project', host: 'localhost', driver: 'codex' },
                model: 'gpt-5.4',
            })
            engine.handleSessionAlive({ sid: session.id, time: now, thinking: false })

            expect(scheduled).toMatchObject([{ intervalMs: 5_000, cancelled: false }])
            now += 30_001
            scheduled[0].callback()

            expect(engine.getSession(session.id)?.active).toBe(false)
            expect(store.sessions.getSession(session.id)?.active).toBe(false)
        } finally {
            engine.stop()
        }

        expect(scheduled[0].cancelled).toBe(true)
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

        cache.handleSessionAlive({ sid: session.id, time: aliveAt, thinking: false })
        await cache.setSessionLifecycleState(session.id, 'open', { touchUpdatedAt: false })
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
})
