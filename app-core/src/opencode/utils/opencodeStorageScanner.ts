import { stat } from 'node:fs/promises'
import { logger } from '@/ui/logger'
import { runDetachedTask } from '@/utils/runDetachedTask'
import { InvalidateSync } from '@/utils/sync'
import type { OpencodeHookEvent } from '../types'
import {
    closeOpencodeStorageDatabase,
    findOpencodeDatabaseSession,
    getOpencodeDatabaseSession,
    type OpencodeStorageSource,
    openOpencodeStorageDatabase,
} from './opencodeStorageDatabase'
import {
    createOpencodeDatabaseScanState,
    primeOpencodeDatabaseSession,
    resetOpencodeDatabaseScanState,
    scanOpencodeDatabaseMessagesAndParts,
} from './opencodeStorageDatabaseScanner'
import { discoverOpencodeFileSessionId, type SessionCandidate } from './opencodeStorageDiscovery'
import {
    normalizePath,
    primeSessionFiles,
    resolveOpencodeStorageDir,
    scanMessagesAndParts,
} from './opencodeStorageScannerSupport'
import { OpencodeStorageWatcher } from './opencodeStorageWatcher'

export type OpencodeStorageScannerHandle = {
    cleanup: () => Promise<void>
    onNewSession: (sessionId: string) => void
}

type OpencodeStorageScannerOptions = {
    sessionId: string | null
    cwd: string
    onEvent: (event: OpencodeHookEvent) => void
    onDiscoveredSessionId?: (sessionId: string) => void
    onSessionMatchFailed?: (message: string) => void
    storageDir?: string
    sessionStartWindowMs?: number
    startupTimestampMs?: number
}

const DEFAULT_SESSION_START_WINDOW_MS = 2 * 60 * 1000
const REPLAY_CLOCK_SKEW_MS = 2000

export async function createOpencodeStorageScanner(
    opts: OpencodeStorageScannerOptions
): Promise<OpencodeStorageScannerHandle> {
    const scanner = new OpencodeStorageScanner(opts)
    await scanner.start()

    return {
        cleanup: async () => scanner.cleanup(),
        onNewSession: (sessionId: string) => {
            runDetachedTask(
                () => scanner.onNewSession(sessionId),
                `[opencode-storage] Failed to process discovered session ${sessionId}`
            )
        },
    }
}

class OpencodeStorageScanner {
    private readonly storageDir: string
    private readonly targetCwd: string | null
    private readonly onEvent: (event: OpencodeHookEvent) => void
    private readonly onDiscoveredSessionId?: (sessionId: string) => void
    private readonly onSessionMatchFailed?: (message: string) => void
    private readonly referenceTimestampMs: number
    private readonly sessionStartWindowMs: number
    private readonly matchDeadlineMs: number
    private readonly seedSessionId: string | null
    private readonly sync: InvalidateSync
    private readonly watcher: OpencodeStorageWatcher

    private activeSessionId: string | null = null
    private activeStorageSource: OpencodeStorageSource | null = null
    private matchFailed = false
    private warnedMissingStorage = false
    private stopped = false
    private scanPromise: Promise<void> | null = null
    private matchDeadlineTimer: ReturnType<typeof setTimeout> | null = null
    private db: ReturnType<typeof openOpencodeStorageDatabase> = null

    private readonly messageRoles = new Map<string, string>()
    private readonly messageFileMtime = new Map<string, number>()
    private readonly partFileMtime = new Map<string, number>()
    private readonly activeMessageIds = new Set<string>()
    private readonly databaseScanState = createOpencodeDatabaseScanState(this.messageRoles)

    constructor(opts: OpencodeStorageScannerOptions) {
        this.storageDir = opts.storageDir ?? resolveOpencodeStorageDir()
        this.targetCwd = opts.cwd ? normalizePath(opts.cwd) : null
        this.onEvent = opts.onEvent
        this.onDiscoveredSessionId = opts.onDiscoveredSessionId
        this.onSessionMatchFailed = opts.onSessionMatchFailed
        this.referenceTimestampMs = opts.startupTimestampMs ?? Date.now()
        this.sessionStartWindowMs = opts.sessionStartWindowMs ?? DEFAULT_SESSION_START_WINDOW_MS
        this.matchDeadlineMs = this.referenceTimestampMs + this.sessionStartWindowMs
        this.seedSessionId = opts.sessionId
        this.sync = new InvalidateSync(() => this.scan())
        this.watcher = new OpencodeStorageWatcher(() => this.sync.invalidate())
        this.db = openOpencodeStorageDatabase(this.storageDir)

        if (!this.targetCwd && !this.seedSessionId) {
            const message = 'No cwd/sessionId available for OpenCode storage matching; scanner disabled.'
            logger.warn(`[opencode-storage] ${message}`)
            this.matchFailed = true
            this.onSessionMatchFailed?.(message)
        }
    }

    async start(): Promise<void> {
        if (this.matchFailed) return
        this.scheduleMatchDeadline()
        await this.sync.invalidateAndAwait()
    }

    async cleanup(): Promise<void> {
        this.stopped = true
        this.sync.stop()
        this.watcher.close()
        this.clearMatchDeadline()
        if (this.scanPromise) {
            try {
                await this.scanPromise
            } catch (error) {
                logger.debug(`[opencode-storage] Pending scan failed during cleanup: ${error}`)
            }
        }
        closeOpencodeStorageDatabase(this.db)
        this.db = null
    }

    async onNewSession(sessionId: string): Promise<void> {
        if (!sessionId || sessionId === this.activeSessionId) return
        await this.setActiveSession(sessionId)
        this.sync.invalidate()
    }

    private async scan(): Promise<void> {
        if (this.stopped || this.matchFailed) return
        this.scanPromise = this.runScan()
        try {
            await this.scanPromise
        } finally {
            this.scanPromise = null
            this.refreshWatcher()
        }
    }

    private async runScan(): Promise<void> {
        const storageReady = await this.ensureStorageDir()
        this.db ??= openOpencodeStorageDatabase(this.storageDir)
        if (!storageReady && !this.db) return

        if (!this.activeSessionId) {
            await this.discoverSessionId()
        }

        if (this.activeSessionId) {
            await this.scanMessagesAndParts(this.activeSessionId)
        }
    }

    private async ensureStorageDir(): Promise<boolean> {
        try {
            const stats = await stat(this.storageDir)
            if (!stats.isDirectory()) {
                if (!this.warnedMissingStorage) {
                    this.warnedMissingStorage = true
                    logger.debug(`[opencode-storage] Storage path is not a directory: ${this.storageDir}`)
                }
                return false
            }
        } catch {
            if (!this.warnedMissingStorage) {
                this.warnedMissingStorage = true
                logger.debug(`[opencode-storage] Storage path missing: ${this.storageDir}`)
            }
            return false
        }

        if (this.warnedMissingStorage) {
            logger.debug(`[opencode-storage] Storage path ready: ${this.storageDir}`)
            this.warnedMissingStorage = false
        }
        return true
    }

    private async discoverSessionId(): Promise<void> {
        if (this.activeSessionId || this.matchFailed) {
            return
        }

        if (this.seedSessionId) {
            await this.setActiveSession(this.seedSessionId)
            return
        }

        if (!this.targetCwd) {
            this.failSessionMatch('Missing cwd for OpenCode storage matching; refusing to guess session.')
            return
        }

        const best =
            (await this.discoverDatabaseSessionId()) ??
            (await discoverOpencodeFileSessionId({
                storageDir: this.storageDir,
                targetCwd: this.targetCwd,
                referenceTimestampMs: this.referenceTimestampMs,
                sessionStartWindowMs: this.sessionStartWindowMs,
            }))
        if (best) {
            await this.setActiveSession(best.sessionId, best.source)
            return
        }

        if (Date.now() > this.matchDeadlineMs) {
            this.failSessionMatch(
                `No OpenCode session found within ${this.sessionStartWindowMs}ms for cwd ${this.targetCwd}`
            )
        }
    }

    private scheduleMatchDeadline(): void {
        if (this.seedSessionId || this.matchDeadlineTimer) return
        const delayMs = Math.max(0, this.matchDeadlineMs - Date.now() + 1)
        this.matchDeadlineTimer = setTimeout(() => this.sync.invalidate(), delayMs)
        this.matchDeadlineTimer.unref?.()
    }

    private clearMatchDeadline(): void {
        if (!this.matchDeadlineTimer) return
        clearTimeout(this.matchDeadlineTimer)
        this.matchDeadlineTimer = null
    }

    private failSessionMatch(message: string): void {
        logger.warn(`[opencode-storage] ${message}`)
        this.matchFailed = true
        this.clearMatchDeadline()
        this.onSessionMatchFailed?.(message)
    }

    private async discoverDatabaseSessionId(): Promise<SessionCandidate | null> {
        if (!this.db || !this.targetCwd) {
            return null
        }
        try {
            const session = findOpencodeDatabaseSession(
                this.db,
                this.targetCwd,
                this.referenceTimestampMs,
                this.sessionStartWindowMs
            )
            return session && session.timeCreated !== null
                ? { sessionId: session.id, score: session.timeCreated - this.referenceTimestampMs, source: 'database' }
                : null
        } catch (error) {
            logger.debug(`[opencode-storage] SQLite session discovery failed: ${error}`)
            return null
        }
    }

    private async setActiveSession(sessionId: string, source?: OpencodeStorageSource): Promise<void> {
        const nextSource = source ?? this.resolveStorageSource(sessionId)
        if (this.activeSessionId === sessionId && this.activeStorageSource === nextSource) {
            return
        }
        this.activeSessionId = sessionId
        this.activeStorageSource = nextSource
        this.clearMatchDeadline()
        this.messageRoles.clear()
        this.messageFileMtime.clear()
        this.partFileMtime.clear()
        this.activeMessageIds.clear()
        resetOpencodeDatabaseScanState(this.databaseScanState)
        if (nextSource === 'database') {
            if (this.db) {
                primeOpencodeDatabaseSession({
                    db: this.db,
                    sessionId,
                    referenceTimestampMs: this.referenceTimestampMs,
                    replayClockSkewMs: REPLAY_CLOCK_SKEW_MS,
                    state: this.databaseScanState,
                    onEvent: this.onEvent,
                })
            }
        } else {
            const messageIds = await primeSessionFiles(
                this.fileRuntime(),
                sessionId,
                this.referenceTimestampMs,
                REPLAY_CLOCK_SKEW_MS
            )
            this.replaceActiveMessageIds(messageIds)
        }
        this.onDiscoveredSessionId?.(sessionId)
        logger.debug(`[opencode-storage] Tracking session ${sessionId} from ${nextSource}`)
    }

    private resolveStorageSource(sessionId: string): OpencodeStorageSource {
        return this.db && getOpencodeDatabaseSession(this.db, sessionId) ? 'database' : 'files'
    }

    private async scanMessagesAndParts(sessionId: string): Promise<void> {
        if (this.activeStorageSource === 'database') {
            if (this.db) {
                scanOpencodeDatabaseMessagesAndParts({
                    db: this.db,
                    sessionId,
                    state: this.databaseScanState,
                    onEvent: this.onEvent,
                })
            }
            return
        }
        this.replaceActiveMessageIds(await scanMessagesAndParts(this.fileRuntime(), sessionId))
    }

    private replaceActiveMessageIds(messageIds: readonly string[]): void {
        this.activeMessageIds.clear()
        for (const messageId of messageIds) {
            this.activeMessageIds.add(messageId)
        }
    }

    private refreshWatcher(): void {
        if (this.stopped || this.matchFailed) return
        this.watcher.refresh({
            storageDir: this.storageDir,
            activeSessionId: this.activeSessionId,
            activeStorageSource: this.activeStorageSource,
            messageIds: [...this.activeMessageIds],
        })
    }

    private fileRuntime(): Parameters<typeof primeSessionFiles>[0] {
        return {
            storageDir: this.storageDir,
            onEvent: this.onEvent,
            messageRoles: this.messageRoles,
            messageFileMtime: this.messageFileMtime,
            partFileMtime: this.partFileMtime,
        }
    }
}
