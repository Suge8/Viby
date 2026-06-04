import { describe, expect, it, vi } from 'vitest'
import { createRuntimeSessionTracker } from './trackedSessionControl'
import { APP_CORE_MANAGED_STARTED_BY, type TrackedSession } from './types'

vi.mock('@/utils/process', () => ({
    killProcess: vi.fn(async () => true),
}))

vi.mock('./managedSessionLifecycle', () => ({
    stopTrackedSessionProcess: vi.fn(async () => true),
}))

describe('createRuntimeSessionTracker', () => {
    it('does not promote late session-start events from abandoned AppCore spawns', () => {
        const session: TrackedSession = {
            startedBy: APP_CORE_MANAGED_STARTED_BY,
            pid: 101,
            spawnAbandoned: true,
        }
        const pidToTrackedSession = new Map<number, TrackedSession>([[101, session]])
        const control = createRuntimeSessionTracker({
            pidToTrackedSession,
            stopRequestedSessionPids: new Set(),
            pidToAwaiter: new Map(),
            pidToErrorAwaiter: new Map(),
        })

        control.onVibySessionWebhook('session-1', {
            hostPid: 101,
            startedBy: 'app-core',
        } as never)

        expect(session.vibySessionId).toBeUndefined()
        expect(pidToTrackedSession.get(101)).toBe(session)
    })
})
