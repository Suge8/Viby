import { getInstalledCliMtimeMs } from './cliInstallStamp';
import { readRunnerState, type RunnerLocallyPersistedState, writeRunnerState } from '@/persistence';
import { isProcessAlive } from '@/utils/process';
import { logger } from '@/ui/logger';

type RunnerHeartbeatOptions = {
  intervalMs: number;
  runnerState: RunnerLocallyPersistedState;
  startedWithCliMtimeMs?: number;
  getTrackedSessionPids: () => Iterable<number>;
  removeTrackedSession: (pid: number) => void;
  requestShutdown: (source: 'exception', errorMessage: string) => void;
  deps?: {
    isProcessAlive?: (pid: number) => boolean;
    readRunnerState?: typeof readRunnerState;
    writeRunnerState?: typeof writeRunnerState;
    getInstalledCliMtimeMs?: typeof getInstalledCliMtimeMs;
  };
};

export type RunnerHeartbeatController = {
  stop(): void;
};

export function startRunnerHeartbeat(
  options: RunnerHeartbeatOptions
): RunnerHeartbeatController {
  const isAlive = options.deps?.isProcessAlive ?? isProcessAlive;
  const readState = options.deps?.readRunnerState ?? readRunnerState;
  const writeState = options.deps?.writeRunnerState ?? writeRunnerState;
  const readInstalledCliMtimeMs = options.deps?.getInstalledCliMtimeMs ?? getInstalledCliMtimeMs;

  let heartbeatRunning = false;
  let loggedCliUpdateWhileRunning = false;

  const intervalId = setInterval(async () => {
    if (heartbeatRunning) {
      return;
    }
    heartbeatRunning = true;

    try {
      if (process.env.DEBUG) {
        logger.debug(`[RUNNER RUN] Health check started at ${new Date().toLocaleString()}`);
      }

      for (const pid of options.getTrackedSessionPids()) {
        if (!isAlive(pid)) {
          logger.debug(`[RUNNER RUN] Removing stale session with PID ${pid} (process no longer exists)`);
          options.removeTrackedSession(pid);
        }
      }

      const installedCliMtimeMs = readInstalledCliMtimeMs();
      if (typeof installedCliMtimeMs === 'number' &&
          typeof options.startedWithCliMtimeMs === 'number' &&
          installedCliMtimeMs !== options.startedWithCliMtimeMs) {
        if (!loggedCliUpdateWhileRunning) {
          logger.debug('[RUNNER RUN] Installed CLI changed while runner is active. Keeping the current runner alive until hub restarts it.');
          loggedCliUpdateWhileRunning = true;
        }
      } else {
        loggedCliUpdateWhileRunning = false;
      }

      const currentRunnerState = await readState();
      if (currentRunnerState && currentRunnerState.pid !== process.pid) {
        logger.debug('[RUNNER RUN] Somehow a different runner was started without killing us. We should kill ourselves.');
        options.requestShutdown('exception', 'A different runner was started without killing us. We should kill ourselves.');
      }

      const nextState: RunnerLocallyPersistedState = {
        ...options.runnerState,
        pid: process.pid,
        lastHeartbeat: new Date().toLocaleString()
      };
      writeState(nextState);

      if (process.env.DEBUG) {
        logger.debug(`[RUNNER RUN] Health check completed at ${nextState.lastHeartbeat}`);
      }
    } catch (error) {
      logger.debug('[RUNNER RUN] Failed to write heartbeat', error);
    } finally {
      heartbeatRunning = false;
    }
  }, options.intervalMs);

  return {
    stop(): void {
      clearInterval(intervalId);
    }
  };
}
