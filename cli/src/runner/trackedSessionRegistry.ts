import type { TrackedSession } from './types'

export function requestTrackedSessionStop(
  stopRequestedSessionPids: Set<number>,
  pid: number
): boolean {
  if (stopRequestedSessionPids.has(pid)) {
    return false
  }

  stopRequestedSessionPids.add(pid)
  return true
}

export function removeTrackedSession(
  trackedSessions: Map<number, TrackedSession>,
  stopRequestedSessionPids: Set<number>,
  pid: number
): void {
  trackedSessions.delete(pid)
  stopRequestedSessionPids.delete(pid)
}
