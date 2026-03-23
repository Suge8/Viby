import type { Machine } from '../sync/syncEngine'
import { getMachineRunnerPid, isMachineRunnerRunning } from './launchRunner'

export function shouldRestartReusedRunner(
    machine: Machine | null | undefined,
    isProcessAlive: (pid: number) => boolean
): boolean {
    if (!machine) {
        return true
    }

    if (!isMachineRunnerRunning(machine)) {
        return true
    }

    const runnerPid = getMachineRunnerPid(machine)
    if (runnerPid === null) {
        return true
    }

    return !isProcessAlive(runnerPid)
}
