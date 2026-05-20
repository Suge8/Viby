import { stat } from 'node:fs/promises'
import { logger } from '@/ui/logger'
import { runDetachedTask } from '@/utils/runDetachedTask'
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
import {
    listSessionInfoFiles,
    normalizePath,
    primeSessionFiles,
    readSessionInfo,
    resolveOpencodeStorageDir,
    scanMessagesAndParts,
} from './opencodeStorageScannerSupport'

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
    intervalMs?: number
    sessionStartWindowMs?: number
    startupTimestampMs?: number
}

type SessionCandidate = {
    sessionId: string
    score: number
    source: OpencodeStorageSource
}

const DEFAULT_SESSION_START_WINDOW_MS = 2 * 60 * 1000
const DEFAULT_SCAN_INTERVAL_MS = 2000
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
    private readonly intervalMs: number
    private readonly seedSessionId: string | null

    private intervalId: ReturnType<typeof setInterval> | null = null
    private activeSessionId: string | null = null
    private activeStorageSource: OpencodeStorageSource | null = null
    private matchFailed = false
    private warnedMissingStorage = false
    private scanning = false
    private db: ReturnType<typeof openOpencodeStorageDatabase> = null

    private readonly messageRoles = new Map<string, string>()
    private readonly messageFileMtime = new Map<string, number>()
    private readonly partFileMtime = new Map<string, number>()
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
        this.intervalMs = opts.intervalMs ?? DEFAULT_SCAN_INTERVAL_MS
        this.seedSessionId = opts.sessionId
        this.db = openOpencodeStorageDatabase(this.storageDir)

        if (!this.targetCwd && !this.seedSessionId) {
            const message = 'No cwd/sessionId available for OpenCode storage matching; scanner disabled.'
            logger.warn(`[opencode-storage] ${message}`)
            this.matchFailed = true
            this.onSessionMatchFailed?.(message)
        }
    }

    async start(): Promise<void> {
        if (this.matchFailed) {
            return
        }
        await this.scan()
        this.intervalId = setInterval(() => {
            runDetachedTask(() => this.scan(), '[opencode-storage] Background scan failed')
        }, this.intervalMs)
    }

    async cleanup(): Promise<void> {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
        closeOpencodeStorageDatabase(this.db)
        this.db = null
    }

    async onNewSession(sessionId: string): Promise<void> {
        if (!sessionId || sessionId === this.activeSessionId) {
            return
        }
        await this.setActiveSession(sessionId)
    }

    private async scan(): Promise<void> {
        if (this.scanning || this.matchFailed) {
            return
        }
        this.scanning = true
        try {
            const storageReady = await this.ensureStorageDir()
            this.db ??= openOpencodeStorageDatabase(this.storageDir)
            if (!storageReady && !this.db) {
                return
            }

            if (!this.activeSessionId) {
                await this.discoverSessionId()
            }

            if (this.activeSessionId) {
                await this.scanMessagesAndParts(this.activeSessionId)
            }
        } finally {
            this.scanning = false
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
            const message = 'Missing cwd for OpenCode storage matching; refusing to guess session.'
            logger.warn(`[opencode-storage] ${message}`)
            this.matchFailed = true
            this.onSessionMatchFailed?.(message)
            return
        }

        const best = (await this.discoverDatabaseSessionId()) ?? (await this.discoverFileSessionId())
        if (best) {
            await this.setActiveSession(best.sessionId, best.source)
            return
        }

        if (Date.now() > this.matchDeadlineMs) {
            const message = `No OpenCode session found within ${this.sessionStartWindowMs}ms for cwd ${this.targetCwd}`
            logger.warn(`[opencode-storage] ${message}`)
            this.matchFailed = true
            this.onSessionMatchFailed?.(message)
        }
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

    private async discoverFileSessionId(): Promise<SessionCandidate | null> {
        if (!(await this.ensureStorageDir())) {
            return null
        }
        const sessionFiles = await listSessionInfoFiles(this.storageDir)
        let best: SessionCandidate | null = null

        for (const filePath of sessionFiles) {
            const info = await readSessionInfo(filePath)
            if (!info || !info.id || !info.directory || info.timeCreated === null) {
                continue
            }

            if (normalizePath(info.directory) !== this.targetCwd) {
                continue
            }

            if (info.timeCreated < this.referenceTimestampMs) {
                continue
            }

            const diff = info.timeCreated - this.referenceTimestampMs
            if (diff > this.sessionStartWindowMs) {
                continue
            }

            if (!best || diff < best.score) {
                best = { sessionId: info.id, score: diff, source: 'files' }
            }
        }

        return best
    }

    private async setActiveSession(sessionId: string, source?: OpencodeStorageSource): Promise<void> {
        const nextSource = source ?? this.resolveStorageSource(sessionId)
        if (this.activeSessionId === sessionId && this.activeStorageSource === nextSource) {
            return
        }
        this.activeSessionId = sessionId
        this.activeStorageSource = nextSource
        this.messageRoles.clear()
        this.messageFileMtime.clear()
        this.partFileMtime.clear()
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
            await primeSessionFiles(this.fileRuntime(), sessionId, this.referenceTimestampMs, REPLAY_CLOCK_SKEW_MS)
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
        await scanMessagesAndParts(this.fileRuntime(), sessionId)
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
