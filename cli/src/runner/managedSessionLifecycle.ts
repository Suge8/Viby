import { killProcess, killProcessByChildProcess } from '@/utils/process';
import { RUNNER_MANAGED_STARTED_BY, type TrackedSession } from './types';

export type StopManagedSessionsResult = {
  stoppedPids: number[];
  failedPids: number[];
};

export function isRunnerManagedSession(session: TrackedSession): boolean {
  return session.startedBy === RUNNER_MANAGED_STARTED_BY && Boolean(session.childProcess);
}

export async function stopTrackedSessionProcess(session: TrackedSession): Promise<boolean> {
  if (isRunnerManagedSession(session) && session.childProcess) {
    return await killProcessByChildProcess(session.childProcess);
  }

  return await killProcess(session.pid);
}

export async function stopRunnerManagedSessions(
  sessions: Iterable<TrackedSession>
): Promise<StopManagedSessionsResult> {
  const managedSessions = Array.from(sessions).filter(isRunnerManagedSession);
  const settled = await Promise.all(
    managedSessions.map(async (session) => {
      try {
        return {
          pid: session.pid,
          stopped: await stopTrackedSessionProcess(session)
        };
      } catch {
        return {
          pid: session.pid,
          stopped: false
        };
      }
    })
  );

  const stoppedPids: number[] = [];
  const failedPids: number[] = [];

  for (const result of settled) {
    if (result.stopped) {
      stoppedPids.push(result.pid);
      continue;
    }

    failedPids.push(result.pid);
  }

  return {
    stoppedPids,
    failedPids
  };
}
