import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunnerLocallyPersistedState } from '@/persistence';

const {
  loggerDebugMock,
  loggerDebugLargeJsonMock,
  readRunnerStateMock,
  writeRunnerStateMock,
  isProcessAliveMock,
  getInstalledCliMtimeMsMock
} = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerDebugLargeJsonMock: vi.fn(),
  readRunnerStateMock: vi.fn(),
  writeRunnerStateMock: vi.fn(),
  isProcessAliveMock: vi.fn(),
  getInstalledCliMtimeMsMock: vi.fn()
}));

vi.mock('@/ui/logger', () => ({
  logger: {
    debug: loggerDebugMock,
    debugLargeJson: loggerDebugLargeJsonMock
  }
}));

vi.mock('@/persistence', () => ({
  readRunnerState: readRunnerStateMock,
  writeRunnerState: writeRunnerStateMock
}));

vi.mock('@/utils/process', () => ({
  isProcessAlive: isProcessAliveMock
}));

vi.mock('./cliInstallStamp', () => ({
  getInstalledCliMtimeMs: getInstalledCliMtimeMsMock
}));

import { startRunnerHeartbeat } from './runnerHeartbeat';

describe('runnerHeartbeat', () => {
  const baseRunnerState: RunnerLocallyPersistedState = {
    pid: 123,
    httpPort: 37173,
    startTime: 'now',
    startedWithCliVersion: '0.1.0',
    startedWithCliMtimeMs: 10,
    startedWithApiUrl: 'http://127.0.0.1:37173',
    startedWithMachineId: 'machine-1',
    startedWithCliApiTokenHash: 'hash',
    runnerLogPath: '/tmp/runner.log'
  };

  beforeEach(() => {
    vi.useFakeTimers();
    loggerDebugMock.mockReset();
    loggerDebugLargeJsonMock.mockReset();
    readRunnerStateMock.mockReset();
    writeRunnerStateMock.mockReset();
    isProcessAliveMock.mockReset();
    getInstalledCliMtimeMsMock.mockReset();
    getInstalledCliMtimeMsMock.mockReturnValue(10);
    readRunnerStateMock.mockResolvedValue({ ...baseRunnerState, pid: process.pid });
  });

  it('prunes stale tracked sessions before writing heartbeat', async () => {
    const trackedPids = [111, 222];
    const removed: number[] = [];
    isProcessAliveMock.mockImplementation((pid: number) => pid === 222);

    const heartbeat = startRunnerHeartbeat({
      intervalMs: 100,
      runnerState: baseRunnerState,
      startedWithCliMtimeMs: 10,
      getTrackedSessionPids: () => trackedPids,
      removeTrackedSession: (pid) => {
        removed.push(pid);
      },
      requestShutdown: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(removed).toEqual([111]);
    expect(writeRunnerStateMock).toHaveBeenCalledTimes(1);
    heartbeat.stop();
  });

  it('requests shutdown when a different runner pid takes over the state file', async () => {
    const requestShutdown = vi.fn();
    isProcessAliveMock.mockReturnValue(true);
    readRunnerStateMock.mockResolvedValue({ ...baseRunnerState, pid: process.pid + 1 });

    const heartbeat = startRunnerHeartbeat({
      intervalMs: 100,
      runnerState: baseRunnerState,
      startedWithCliMtimeMs: 10,
      getTrackedSessionPids: () => [],
      removeTrackedSession: vi.fn(),
      requestShutdown
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(requestShutdown).toHaveBeenCalledWith(
      'exception',
      'A different runner was started without killing us. We should kill ourselves.'
    );
    heartbeat.stop();
  });
});
