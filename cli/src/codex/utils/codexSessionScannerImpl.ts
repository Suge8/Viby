import { homedir } from 'node:os'
import { join } from 'node:path'
import {
    BaseSessionScanner,
    type SessionFileScanResult,
    type SessionFileScanStats,
} from '@/modules/common/session/BaseSessionScanner'
import { logger } from '@/ui/logger'
import type { CodexSessionEvent } from './codexEventConverter'
import { activateCodexSession, resolveSessionActivation } from './codexSessionScannerActivation'
import { listSessionFiles, readSessionFile, sortFilesByMtime } from './codexSessionScannerFs'
import {
    appendPendingEvents,
    type Candidate,
    emitCodexSessionEvents,
    getCandidateForFile,
    getRecentActivityCandidateForFile,
    getSessionDatePrefixes,
    type PendingEvents,
} from './codexSessionScannerSupport'
import {
    ACTIVE_SESSION_FALLBACK_SCAN_INTERVAL_MS,
    type CodexSessionScannerOptions,
    DEFAULT_SESSION_START_WINDOW_MS,
    SESSION_DISCOVERY_SCAN_INTERVAL_MS,
} from './codexSessionScannerTypes'

export class CodexSessionScannerImpl extends BaseSessionScanner<CodexSessionEvent> {
    private readonly sessionsRoot: string
    private readonly onEvent: (event: CodexSessionEvent) => void
    private readonly onDiscoveredSessionId?: (sessionId: string) => void
    private readonly onSessionMatchFailed?: (message: string) => void
    private readonly sessionIdByFile = new Map<string, string>()
    private readonly sessionCwdByFile = new Map<string, string>()
    private readonly sessionTimestampByFile = new Map<string, number>()
    private readonly pendingEventsByFile = new Map<string, PendingEvents>()
    private readonly sessionMetaParsed = new Set<string>()
    private readonly fileEpochByPath = new Map<string, number>()
    private readonly targetCwd: string | null
    private readonly referenceTimestampMs: number
    private readonly sessionStartWindowMs: number
    private readonly discoveryScanIntervalMs: number
    private readonly matchDeadlineMs: number
    private readonly sessionDatePrefixes: Set<string> | null

    private activeSessionId: string | null
    private reportedSessionId: string | null
    private matchFailed = false
    private bestWithinWindow: Candidate | null = null
    private readonly recentActivitySessionIds = new Set<string>()
    private firstRecentActivityCandidateResolved = false
    private readonly firstRecentActivitySessionIds = new Set<string>()
    private loggedAmbiguousRecentActivity = false

    constructor(opts: CodexSessionScannerOptions, targetCwd: string | null) {
        const discoveryScanIntervalMs = opts.discoveryScanIntervalMs ?? SESSION_DISCOVERY_SCAN_INTERVAL_MS
        super({ fallbackIntervalMs: discoveryScanIntervalMs })
        const codexHomeDir = process.env.CODEX_HOME || join(homedir(), '.codex')
        this.sessionsRoot = join(codexHomeDir, 'sessions')
        this.onEvent = opts.onEvent
        this.onDiscoveredSessionId = opts.onDiscoveredSessionId
        this.onSessionMatchFailed = opts.onSessionMatchFailed
        this.activeSessionId = opts.sessionId
        this.reportedSessionId = opts.sessionId
        this.targetCwd = targetCwd
        this.referenceTimestampMs = opts.startupTimestampMs ?? Date.now()
        this.sessionStartWindowMs = opts.sessionStartWindowMs ?? DEFAULT_SESSION_START_WINDOW_MS
        this.discoveryScanIntervalMs = discoveryScanIntervalMs
        this.matchDeadlineMs = this.referenceTimestampMs + this.sessionStartWindowMs
        this.sessionDatePrefixes = this.targetCwd
            ? getSessionDatePrefixes(this.referenceTimestampMs, this.sessionStartWindowMs)
            : null

        logger.debug(
            `[CODEX_SESSION_SCANNER] Init: targetCwd=${this.targetCwd ?? 'none'} startupTs=${new Date(this.referenceTimestampMs).toISOString()} windowMs=${this.sessionStartWindowMs}`
        )
    }

    public onNewSession(sessionId: string): void {
        if (this.activeSessionId === sessionId) {
            return
        }
        logger.debug(`[CODEX_SESSION_SCANNER] Switching to new session: ${sessionId}`)
        this.setActiveSessionId(sessionId)
        this.invalidate()
    }

    protected shouldScan(): boolean {
        return !this.matchFailed
    }

    protected getFallbackIntervalMs(): number {
        if (!this.activeSessionId && this.targetCwd) {
            return this.discoveryScanIntervalMs
        }
        return ACTIVE_SESSION_FALLBACK_SCAN_INTERVAL_MS
    }

    protected shouldWatchFile(filePath: string): boolean {
        if (!this.activeSessionId) {
            if (!this.targetCwd) {
                return false
            }
            return (
                getCandidateForFile({
                    filePath,
                    sessionIdByFile: this.sessionIdByFile,
                    sessionCwdByFile: this.sessionCwdByFile,
                    sessionTimestampByFile: this.sessionTimestampByFile,
                    targetCwd: this.targetCwd,
                    referenceTimestampMs: this.referenceTimestampMs,
                    sessionStartWindowMs: this.sessionStartWindowMs,
                }) !== null
            )
        }
        const fileSessionId = this.sessionIdByFile.get(filePath)
        if (fileSessionId) {
            return fileSessionId === this.activeSessionId
        }
        return filePath.endsWith(`-${this.activeSessionId}.jsonl`)
    }

    protected async initialize(): Promise<void> {
        const files = await listSessionFiles(this.sessionsRoot, this.sessionsRoot, this.sessionDatePrefixes)
        for (const filePath of files) {
            const { nextCursor } = await readSessionFile({
                filePath,
                startLine: 0,
                sessionMetaParsed: this.sessionMetaParsed,
                fileEpochByPath: this.fileEpochByPath,
                sessionIdByFile: this.sessionIdByFile,
                sessionCwdByFile: this.sessionCwdByFile,
                sessionTimestampByFile: this.sessionTimestampByFile,
            })
            this.setCursor(filePath, nextCursor)
            if (this.shouldWatchFile(filePath)) {
                this.ensureWatcher(filePath)
            }
        }
    }

    protected async beforeScan(): Promise<void> {
        this.bestWithinWindow = null
        this.recentActivitySessionIds.clear()
    }

    protected async findSessionFiles(): Promise<string[]> {
        const files = await listSessionFiles(this.sessionsRoot, this.sessionsRoot, this.sessionDatePrefixes)
        return sortFilesByMtime(files)
    }

    protected async parseSessionFile(
        filePath: string,
        cursor: number
    ): Promise<SessionFileScanResult<CodexSessionEvent>> {
        if (this.shouldSkipFile(filePath)) {
            return { events: [], nextCursor: cursor }
        }
        return readSessionFile({
            filePath,
            startLine: cursor,
            sessionMetaParsed: this.sessionMetaParsed,
            fileEpochByPath: this.fileEpochByPath,
            sessionIdByFile: this.sessionIdByFile,
            sessionCwdByFile: this.sessionCwdByFile,
            sessionTimestampByFile: this.sessionTimestampByFile,
        })
    }

    protected generateEventKey(event: CodexSessionEvent, context: { filePath: string; lineIndex?: number }): string {
        const epoch = this.fileEpochByPath.get(context.filePath) ?? 0
        const lineIndex = context.lineIndex ?? -1
        return `${context.filePath}:${epoch}:${lineIndex}`
    }

    protected async handleFileScan(stats: SessionFileScanStats<CodexSessionEvent>): Promise<void> {
        const filePath = stats.filePath
        const fileSessionId = this.sessionIdByFile.get(filePath) ?? null

        if (!this.activeSessionId && this.targetCwd) {
            appendPendingEvents(this.pendingEventsByFile, filePath, stats.events, fileSessionId)
            const candidate = getCandidateForFile({
                filePath,
                sessionIdByFile: this.sessionIdByFile,
                sessionCwdByFile: this.sessionCwdByFile,
                sessionTimestampByFile: this.sessionTimestampByFile,
                targetCwd: this.targetCwd,
                referenceTimestampMs: this.referenceTimestampMs,
                sessionStartWindowMs: this.sessionStartWindowMs,
            })
            if (candidate && (!this.bestWithinWindow || candidate.score < this.bestWithinWindow.score)) {
                this.bestWithinWindow = candidate
            }
            const recentActivityCandidate = getRecentActivityCandidateForFile({
                filePath,
                newCount: stats.newCount,
                sessionIdByFile: this.sessionIdByFile,
                sessionCwdByFile: this.sessionCwdByFile,
                targetCwd: this.targetCwd,
            })
            if (recentActivityCandidate) {
                this.recentActivitySessionIds.add(recentActivityCandidate.sessionId)
            }
            if (stats.newCount > 0) {
                logger.debug(`[CODEX_SESSION_SCANNER] Buffered ${stats.newCount} pending events from ${filePath}`)
            }
            return
        }

        const emittedForFile = emitCodexSessionEvents({
            events: stats.events,
            fileSessionId,
            activeSessionId: this.activeSessionId,
            onEvent: this.onEvent,
        })
        if (emittedForFile > 0) {
            logger.debug(`[CODEX_SESSION_SCANNER] Emitted ${emittedForFile} new events from ${filePath}`)
        }
    }

    protected async afterScan(): Promise<void> {
        const activation = resolveSessionActivation({
            activeSessionId: this.activeSessionId,
            targetCwd: this.targetCwd,
            bestWithinWindow: this.bestWithinWindow,
            recentActivitySessionIds: this.recentActivitySessionIds,
            firstRecentActivityCandidateResolved: this.firstRecentActivityCandidateResolved,
            firstRecentActivitySessionIds: this.firstRecentActivitySessionIds,
            loggedAmbiguousRecentActivity: this.loggedAmbiguousRecentActivity,
            pendingEventsByFile: this.pendingEventsByFile,
            sessionStartWindowMs: this.sessionStartWindowMs,
            matchDeadlineMs: this.matchDeadlineMs,
            onSessionMatchFailed: this.onSessionMatchFailed,
            setMatchFailed: () => {
                this.matchFailed = true
            },
            setLoggedAmbiguousRecentActivity: () => {
                this.loggedAmbiguousRecentActivity = true
            },
            setActiveSessionId: (sessionId) => {
                this.setActiveSessionId(sessionId)
            },
        })
        this.firstRecentActivityCandidateResolved = activation.firstRecentActivityCandidateResolved
        this.loggedAmbiguousRecentActivity = activation.loggedAmbiguousRecentActivity
    }

    private shouldSkipFile(filePath: string): boolean {
        if (!this.activeSessionId) {
            return false
        }
        const fileSessionId = this.sessionIdByFile.get(filePath)
        if (fileSessionId && fileSessionId !== this.activeSessionId) {
            return true
        }
        return !fileSessionId && !filePath.endsWith(`-${this.activeSessionId}.jsonl`)
    }

    private reportSessionId(sessionId: string): void {
        if (this.reportedSessionId === sessionId) {
            return
        }
        this.reportedSessionId = sessionId
        this.onDiscoveredSessionId?.(sessionId)
    }

    private setActiveSessionId(sessionId: string): void {
        this.activeSessionId = sessionId
        activateCodexSession({
            sessionId,
            targetCwd: this.targetCwd,
            pendingEventsByFile: this.pendingEventsByFile,
            sessionIdByFile: this.sessionIdByFile,
            watchedFiles: this.getWatchedFiles(),
            shouldWatchFile: (filePath) => this.shouldWatchFile(filePath),
            ensureWatcher: (filePath) => this.ensureWatcher(filePath),
            pruneWatchers: (nextWatchedFiles) => this.pruneWatchers(nextWatchedFiles),
            reportSessionId: (nextSessionId) => this.reportSessionId(nextSessionId),
            onEvent: this.onEvent,
        })
    }
}
