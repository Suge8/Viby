import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import {
  isRunnerManagedSession,
  stopRunnerManagedSessions,
  stopTrackedSessionProcess
} from './managedSessionLifecycle';
import {
  EXTERNAL_TERMINAL_STARTED_BY,
  RUNNER_MANAGED_STARTED_BY
} from './types';

const {
  killProcessMock,
  killProcessByChildProcessMock
} = vi.hoisted(() => ({
  killProcessMock: vi.fn(),
  killProcessByChildProcessMock: vi.fn()
}));

vi.mock('@/utils/process', () => ({
  killProcess: killProcessMock,
  killProcessByChildProcess: killProcessByChildProcessMock
}));

function createChildProcess(pid: number): ChildProcess {
  return { pid } as ChildProcess;
}

describe('managedSessionLifecycle', () => {
  beforeEach(() => {
    killProcessMock.mockReset();
    killProcessByChildProcessMock.mockReset();
  });

  it('identifies runner-managed sessions by owner and child process', () => {
    expect(isRunnerManagedSession({
      startedBy: RUNNER_MANAGED_STARTED_BY,
      pid: 101,
      childProcess: createChildProcess(101)
    })).toBe(true);

    expect(isRunnerManagedSession({
      startedBy: RUNNER_MANAGED_STARTED_BY,
      pid: 102
    })).toBe(false);

    expect(isRunnerManagedSession({
      startedBy: EXTERNAL_TERMINAL_STARTED_BY,
      pid: 103,
      childProcess: createChildProcess(103)
    })).toBe(false);
  });

  it('kills runner-managed sessions through the child-process tree', async () => {
    killProcessByChildProcessMock.mockResolvedValue(true);

    const stopped = await stopTrackedSessionProcess({
      startedBy: RUNNER_MANAGED_STARTED_BY,
      pid: 201,
      childProcess: createChildProcess(201)
    });

    expect(stopped).toBe(true);
    expect(killProcessByChildProcessMock).toHaveBeenCalledTimes(1);
    expect(killProcessByChildProcessMock).toHaveBeenCalledWith(expect.objectContaining({ pid: 201 }));
    expect(killProcessMock).not.toHaveBeenCalled();
  });

  it('kills externally-started sessions by pid fallback', async () => {
    killProcessMock.mockResolvedValue(true);

    const stopped = await stopTrackedSessionProcess({
      startedBy: EXTERNAL_TERMINAL_STARTED_BY,
      pid: 301
    });

    expect(stopped).toBe(true);
    expect(killProcessMock).toHaveBeenCalledTimes(1);
    expect(killProcessMock).toHaveBeenCalledWith(301);
    expect(killProcessByChildProcessMock).not.toHaveBeenCalled();
  });

  it('stops only runner-managed sessions during runner shutdown cleanup', async () => {
    killProcessByChildProcessMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await stopRunnerManagedSessions([
      {
        startedBy: RUNNER_MANAGED_STARTED_BY,
        pid: 401,
        childProcess: createChildProcess(401)
      },
      {
        startedBy: EXTERNAL_TERMINAL_STARTED_BY,
        pid: 402
      },
      {
        startedBy: RUNNER_MANAGED_STARTED_BY,
        pid: 403,
        childProcess: createChildProcess(403)
      }
    ]);

    expect(killProcessByChildProcessMock).toHaveBeenCalledTimes(2);
    expect(killProcessMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      stoppedPids: [401],
      failedPids: [403]
    });
  });
});
