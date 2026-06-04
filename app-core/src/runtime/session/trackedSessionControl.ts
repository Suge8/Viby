import type { Metadata } from '@/api/types'
import { logger } from '@/ui/logger'
import { killProcess } from '@/utils/process'
import { stopTrackedSessionProcess } from './managedSessionLifecycle'
import { removeTrackedSession, requestTrackedSessionStop } from './trackedSessionRegistry'
import { APP_CORE_MANAGED_STARTED_BY, EXTERNAL_TERMINAL_STARTED_BY, type TrackedSession } from './types'

type RuntimeSessionTrackerOptions = {
    pidToTrackedSession: Map<number, TrackedSession>
    stopRequestedSessionPids: Set<number>
    pidToAwaiter: Map<number, (session: TrackedSession) => void>
    pidToErrorAwaiter: Map<number, (errorMessage: string) => void>
}

export function createRuntimeSessionTracker(options: RuntimeSessionTrackerOptions) {
    const { pidToTrackedSession, stopRequestedSessionPids, pidToAwaiter, pidToErrorAwaiter } = options

    const onChildExited = (pid: number) => {
        logger.debug(`[RuntimeSupervisor] Removing exited process PID ${pid} from tracking`)
        removeTrackedSession(pidToTrackedSession, stopRequestedSessionPids, pid)
        pidToAwaiter.delete(pid)
        pidToErrorAwaiter.delete(pid)
    }

    const onVibySessionWebhook = (sessionId: string, sessionMetadata: Metadata) => {
        logger.debugLargeJson(`[RuntimeSupervisor] Session reported`, sessionMetadata)

        const pid = sessionMetadata.hostPid
        if (!pid) {
            logger.debug(`[RuntimeSupervisor] Session session-start event missing hostPid for sessionId: ${sessionId}`)
            return
        }

        logger.debug(
            `[RuntimeSupervisor] Session session-start event: ${sessionId}, PID: ${pid}, started by: ${sessionMetadata.startedBy || 'unknown'}`
        )
        logger.debug(
            `[RuntimeSupervisor] Current tracked sessions before session-start event: ${Array.from(pidToTrackedSession.keys()).join(', ')}`
        )

        const existingSession = pidToTrackedSession.get(pid)
        if (existingSession && existingSession.startedBy === APP_CORE_MANAGED_STARTED_BY) {
            if (existingSession.spawnAbandoned) {
                logger.debug(
                    `[RuntimeSupervisor] Ignoring late session-start event from abandoned app-core-spawned PID ${pid}`
                )
                void stopTrackedSessionProcess(existingSession).catch((error) => {
                    logger.debug(`[RuntimeSupervisor] Failed to stop abandoned app-core-spawned PID ${pid}:`, error)
                })
                return
            }
            existingSession.vibySessionId = sessionId
            existingSession.vibySessionMetadataFromLocalWebhook = sessionMetadata
            logger.debug(`[RuntimeSupervisor] Updated app-core-spawned session ${sessionId} with metadata`)

            const awaiter = pidToAwaiter.get(pid)
            if (!awaiter) {
                return
            }

            pidToAwaiter.delete(pid)
            pidToErrorAwaiter.delete(pid)
            awaiter(existingSession)
            logger.debug(`[RuntimeSupervisor] Resolved session awaiter for PID ${pid}`)
            return
        }

        if (!existingSession) {
            if (sessionMetadata.startedBy === 'app-core') {
                logger.debug(
                    `[RuntimeSupervisor] Ignoring orphaned app-core-spawned session ${sessionId} from PID ${pid}`
                )
                void killProcess(pid).catch((error) => {
                    logger.debug(`[RuntimeSupervisor] Failed to stop orphaned app-core-spawned PID ${pid}:`, error)
                })
                return
            }
            pidToTrackedSession.set(pid, {
                startedBy: EXTERNAL_TERMINAL_STARTED_BY,
                vibySessionId: sessionId,
                vibySessionMetadataFromLocalWebhook: sessionMetadata,
                pid,
            })
            logger.debug(`[RuntimeSupervisor] Registered externally-started session ${sessionId}`)
        }
    }

    const stopSession = (sessionId: string): boolean => {
        logger.debug(`[RuntimeSupervisor] Attempting to stop session ${sessionId}`)

        for (const [pid, session] of pidToTrackedSession.entries()) {
            if (
                session.vibySessionId !== sessionId &&
                (!sessionId.startsWith('PID-') || pid !== parseInt(sessionId.replace('PID-', '')))
            ) {
                continue
            }

            if (!requestTrackedSessionStop(stopRequestedSessionPids, pid)) {
                logger.debug(`[RuntimeSupervisor] Stop already requested for session ${sessionId}`)
                return true
            }

            void stopTrackedSessionProcess(session)
                .then((stopped: boolean) => {
                    const appCoreManaged = session.startedBy === APP_CORE_MANAGED_STARTED_BY
                    if (stopped) {
                        logger.debug(
                            appCoreManaged
                                ? `[RuntimeSupervisor] Requested termination for app-core-spawned session ${sessionId}`
                                : `[RuntimeSupervisor] Requested termination for external session PID ${pid}`
                        )
                        return
                    }

                    stopRequestedSessionPids.delete(pid)
                    logger.debug(
                        appCoreManaged
                            ? `[RuntimeSupervisor] Failed to kill session ${sessionId}`
                            : `[RuntimeSupervisor] Failed to kill external session PID ${pid}`
                    )
                })
                .catch((error: unknown) => {
                    stopRequestedSessionPids.delete(pid)
                    const appCoreManaged = session.startedBy === APP_CORE_MANAGED_STARTED_BY
                    logger.debug(
                        appCoreManaged
                            ? `[RuntimeSupervisor] Failed to kill session ${sessionId}:`
                            : `[RuntimeSupervisor] Failed to kill external session PID ${pid}:`,
                        error
                    )
                })

            logger.debug(`[RuntimeSupervisor] Stop requested for session ${sessionId}; keeping tracking until exit`)
            return true
        }

        logger.debug(`[RuntimeSupervisor] Session ${sessionId} not found`)
        return false
    }

    return {
        getCurrentChildren: () => Array.from(pidToTrackedSession.values()),
        onChildExited,
        onVibySessionWebhook,
        stopSession,
    }
}
