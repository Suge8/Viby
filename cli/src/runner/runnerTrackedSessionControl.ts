import type { Metadata } from '@/api/types'
import { logger } from '@/ui/logger'
import { stopTrackedSessionProcess } from './managedSessionLifecycle'
import { removeTrackedSession, requestTrackedSessionStop } from './trackedSessionRegistry'
import { EXTERNAL_TERMINAL_STARTED_BY, RUNNER_MANAGED_STARTED_BY, type TrackedSession } from './types'

type RunnerTrackedSessionControlOptions = {
    pidToTrackedSession: Map<number, TrackedSession>
    stopRequestedSessionPids: Set<number>
    pidToAwaiter: Map<number, (session: TrackedSession) => void>
    pidToErrorAwaiter: Map<number, (errorMessage: string) => void>
}

export function createRunnerTrackedSessionControl(options: RunnerTrackedSessionControlOptions) {
    const { pidToTrackedSession, stopRequestedSessionPids, pidToAwaiter, pidToErrorAwaiter } = options

    const onChildExited = (pid: number) => {
        logger.debug(`[RUNNER RUN] Removing exited process PID ${pid} from tracking`)
        removeTrackedSession(pidToTrackedSession, stopRequestedSessionPids, pid)
        pidToAwaiter.delete(pid)
        pidToErrorAwaiter.delete(pid)
    }

    const onVibySessionWebhook = (sessionId: string, sessionMetadata: Metadata) => {
        logger.debugLargeJson(`[RUNNER RUN] Session reported`, sessionMetadata)

        const pid = sessionMetadata.hostPid
        if (!pid) {
            logger.debug(`[RUNNER RUN] Session webhook missing hostPid for sessionId: ${sessionId}`)
            return
        }

        logger.debug(
            `[RUNNER RUN] Session webhook: ${sessionId}, PID: ${pid}, started by: ${sessionMetadata.startedBy || 'unknown'}`
        )
        logger.debug(
            `[RUNNER RUN] Current tracked sessions before webhook: ${Array.from(pidToTrackedSession.keys()).join(', ')}`
        )

        const existingSession = pidToTrackedSession.get(pid)
        if (existingSession && existingSession.startedBy === RUNNER_MANAGED_STARTED_BY) {
            existingSession.vibySessionId = sessionId
            existingSession.vibySessionMetadataFromLocalWebhook = sessionMetadata
            logger.debug(`[RUNNER RUN] Updated runner-spawned session ${sessionId} with metadata`)

            const awaiter = pidToAwaiter.get(pid)
            if (!awaiter) {
                return
            }

            pidToAwaiter.delete(pid)
            pidToErrorAwaiter.delete(pid)
            awaiter(existingSession)
            logger.debug(`[RUNNER RUN] Resolved session awaiter for PID ${pid}`)
            return
        }

        if (!existingSession) {
            pidToTrackedSession.set(pid, {
                startedBy: EXTERNAL_TERMINAL_STARTED_BY,
                vibySessionId: sessionId,
                vibySessionMetadataFromLocalWebhook: sessionMetadata,
                pid,
            })
            logger.debug(`[RUNNER RUN] Registered externally-started session ${sessionId}`)
        }
    }

    const stopSession = (sessionId: string): boolean => {
        logger.debug(`[RUNNER RUN] Attempting to stop session ${sessionId}`)

        for (const [pid, session] of pidToTrackedSession.entries()) {
            if (
                session.vibySessionId !== sessionId &&
                (!sessionId.startsWith('PID-') || pid !== parseInt(sessionId.replace('PID-', '')))
            ) {
                continue
            }

            if (!requestTrackedSessionStop(stopRequestedSessionPids, pid)) {
                logger.debug(`[RUNNER RUN] Stop already requested for session ${sessionId}`)
                return true
            }

            void stopTrackedSessionProcess(session)
                .then((stopped: boolean) => {
                    const runnerManaged = session.startedBy === RUNNER_MANAGED_STARTED_BY
                    if (stopped) {
                        logger.debug(
                            runnerManaged
                                ? `[RUNNER RUN] Requested termination for runner-spawned session ${sessionId}`
                                : `[RUNNER RUN] Requested termination for external session PID ${pid}`
                        )
                        return
                    }

                    stopRequestedSessionPids.delete(pid)
                    logger.debug(
                        runnerManaged
                            ? `[RUNNER RUN] Failed to kill session ${sessionId}`
                            : `[RUNNER RUN] Failed to kill external session PID ${pid}`
                    )
                })
                .catch((error: unknown) => {
                    stopRequestedSessionPids.delete(pid)
                    const runnerManaged = session.startedBy === RUNNER_MANAGED_STARTED_BY
                    logger.debug(
                        runnerManaged
                            ? `[RUNNER RUN] Failed to kill session ${sessionId}:`
                            : `[RUNNER RUN] Failed to kill external session PID ${pid}:`,
                        error
                    )
                })

            logger.debug(`[RUNNER RUN] Stop requested for session ${sessionId}; keeping tracking until exit`)
            return true
        }

        logger.debug(`[RUNNER RUN] Session ${sessionId} not found`)
        return false
    }

    return {
        getCurrentChildren: () => Array.from(pidToTrackedSession.values()),
        onChildExited,
        onVibySessionWebhook,
        stopSession,
    }
}
