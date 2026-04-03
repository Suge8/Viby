import { describe, expect, it } from 'vitest'

import { removeTrackedSession, requestTrackedSessionStop } from './trackedSessionRegistry'
import { RUNNER_MANAGED_STARTED_BY, type TrackedSession } from './types'

describe('trackedSessionRegistry', () => {
  it('marks a tracked session stop request only once per pid', () => {
    const stopRequestedSessionPids = new Set<number>()

    expect(requestTrackedSessionStop(stopRequestedSessionPids, 101)).toBe(true)
    expect(requestTrackedSessionStop(stopRequestedSessionPids, 101)).toBe(false)
    expect(Array.from(stopRequestedSessionPids)).toEqual([101])
  })

  it('removes both tracked session and stop-request marker together', () => {
    const trackedSessions = new Map<number, TrackedSession>([[101, {
      startedBy: RUNNER_MANAGED_STARTED_BY,
      pid: 101
    }]])
    const stopRequestedSessionPids = new Set<number>([101])

    removeTrackedSession(trackedSessions, stopRequestedSessionPids, 101)

    expect(trackedSessions.has(101)).toBe(false)
    expect(stopRequestedSessionPids.has(101)).toBe(false)
  })
})
