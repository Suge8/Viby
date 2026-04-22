import { logger } from '@/ui/logger'
import { flushPendingEventsForSession, getFilesForSession, type PendingEvents } from './codexSessionScannerSupport'

export function resolveSessionActivation(options: {
    activeSessionId: string | null
    targetCwd: string | null
    bestWithinWindow: { sessionId: string } | null
    recentActivitySessionIds: ReadonlySet<string>
    firstRecentActivityCandidateResolved: boolean
    firstRecentActivitySessionIds: Set<string>
    loggedAmbiguousRecentActivity: boolean
    pendingEventsByFile: Map<string, PendingEvents>
    sessionStartWindowMs: number
    matchDeadlineMs: number
    onSessionMatchFailed?: (message: string) => void
    setMatchFailed: () => void
    setLoggedAmbiguousRecentActivity: () => void
    setActiveSessionId: (sessionId: string) => void
}): {
    firstRecentActivityCandidateResolved: boolean
    loggedAmbiguousRecentActivity: boolean
} {
    if (options.activeSessionId || !options.targetCwd) {
        return {
            firstRecentActivityCandidateResolved: options.firstRecentActivityCandidateResolved,
            loggedAmbiguousRecentActivity: options.loggedAmbiguousRecentActivity,
        }
    }

    if (options.bestWithinWindow) {
        logger.debug(
            `[CODEX_SESSION_SCANNER] Selected session ${options.bestWithinWindow.sessionId} within start window`
        )
        options.setActiveSessionId(options.bestWithinWindow.sessionId)
        return {
            firstRecentActivityCandidateResolved: options.firstRecentActivityCandidateResolved,
            loggedAmbiguousRecentActivity: options.loggedAmbiguousRecentActivity,
        }
    }

    const nextResolved =
        options.firstRecentActivityCandidateResolved || options.recentActivitySessionIds.size === 0
            ? options.firstRecentActivityCandidateResolved
            : captureFirstRecentActivityCandidate(
                  options.recentActivitySessionIds,
                  options.firstRecentActivitySessionIds
              )
    if (options.firstRecentActivitySessionIds.size === 1) {
        const [sessionId] = options.firstRecentActivitySessionIds
        if (sessionId) {
            logger.debug(
                `[CODEX_SESSION_SCANNER] Selected session ${sessionId} from first unique matching activity after startup`
            )
            options.setActiveSessionId(sessionId)
        }
        return {
            firstRecentActivityCandidateResolved: nextResolved,
            loggedAmbiguousRecentActivity: options.loggedAmbiguousRecentActivity,
        }
    }

    if (!options.loggedAmbiguousRecentActivity && nextResolved && options.firstRecentActivitySessionIds.size > 1) {
        logger.debug(
            '[CODEX_SESSION_SCANNER] First matching activity after startup was ambiguous; refusing reused-session adoption'
        )
        options.setLoggedAmbiguousRecentActivity()
        return {
            firstRecentActivityCandidateResolved: nextResolved,
            loggedAmbiguousRecentActivity: true,
        }
    }

    if (Date.now() > options.matchDeadlineMs) {
        options.setMatchFailed()
        options.pendingEventsByFile.clear()
        const message = `No Codex session found within ${options.sessionStartWindowMs}ms for cwd ${options.targetCwd}; refusing fallback.`
        logger.warn(`[CODEX_SESSION_SCANNER] ${message}`)
        options.onSessionMatchFailed?.(message)
    } else if (options.pendingEventsByFile.size > 0) {
        logger.debug('[CODEX_SESSION_SCANNER] No session candidate matched yet; pending events buffered')
    }

    return {
        firstRecentActivityCandidateResolved: nextResolved,
        loggedAmbiguousRecentActivity: options.loggedAmbiguousRecentActivity,
    }
}

export function activateCodexSession(options: {
    sessionId: string
    targetCwd: string | null
    pendingEventsByFile: Map<string, PendingEvents>
    sessionIdByFile: Map<string, string>
    watchedFiles: string[]
    shouldWatchFile: (filePath: string) => boolean
    ensureWatcher: (filePath: string) => void
    pruneWatchers: (nextWatchedFiles: string[]) => void
    reportSessionId: (sessionId: string) => void
    onEvent: (event: import('./codexEventConverter').CodexSessionEvent) => void
}): void {
    options.reportSessionId(options.sessionId)
    const candidateFiles = getFilesForSession(options.sessionId, options.sessionIdByFile, options.watchedFiles)
    for (const filePath of candidateFiles) {
        if (options.shouldWatchFile(filePath)) {
            options.ensureWatcher(filePath)
        }
    }
    options.pruneWatchers(options.watchedFiles.filter((filePath) => options.shouldWatchFile(filePath)))

    if (!options.targetCwd) {
        options.pendingEventsByFile.clear()
        return
    }

    const emitted = flushPendingEventsForSession({
        pendingEventsByFile: options.pendingEventsByFile,
        sessionId: options.sessionId,
        onEvent: options.onEvent,
    })
    if (emitted > 0) {
        logger.debug(`[CODEX_SESSION_SCANNER] Emitted ${emitted} pending events for session ${options.sessionId}`)
    }
}

function captureFirstRecentActivityCandidate(
    recentActivitySessionIds: ReadonlySet<string>,
    firstRecentActivitySessionIds: Set<string>
): boolean {
    for (const sessionId of recentActivitySessionIds) {
        firstRecentActivitySessionIds.add(sessionId)
    }
    return true
}
