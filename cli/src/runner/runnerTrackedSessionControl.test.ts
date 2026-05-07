import { describe, expect, it, vi } from 'vitest'
import { createRunnerTrackedSessionControl } from './runnerTrackedSessionControl'
import { RUNNER_MANAGED_STARTED_BY, type TrackedSession } from './types'

vi.mock('@/utils/process', () => ({
    killProcess: vi.fn(async () => true),
}))

vi.mock('./managedSessionLifecycle', () => ({
    stopTrackedSessionProcess: vi.fn(async () => true),
}))

describe('createRunnerTrackedSessionControl', () => {
    it('does not promote late webhooks from abandoned runner spawns', () => {
        const session: TrackedSession = {
            startedBy: RUNNER_MANAGED_STARTED_BY,
            pid: 101,
            spawnAbandoned: true,
        }
        const pidToTrackedSession = new Map<number, TrackedSession>([[101, session]])
        const control = createRunnerTrackedSessionControl({
            pidToTrackedSession,
            stopRequestedSessionPids: new Set(),
            pidToAwaiter: new Map(),
            pidToErrorAwaiter: new Map(),
        })

        control.onVibySessionWebhook('session-1', {
            hostPid: 101,
            startedBy: 'runner',
        } as never)

        expect(session.vibySessionId).toBeUndefined()
        expect(pidToTrackedSession.get(101)).toBe(session)
    })
})
