import { stat } from 'node:fs/promises'
import { logger } from '@/ui/logger'
import { runDetachedTask } from '@/utils/runDetachedTask'
import type { OpencodeHookEvent } from '../types'
import {
    getString,
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
        cleanup: async () => {
            await scanner.cleanup()
        },
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
    private matchFailed = false
    private warnedMissingStorage = false
    private scanning = false

    private readonly messageRoles = new Map<string, string>()
    private readonly messageFileMtime = new Map<string, number>()
    private readonly partFileMtime = new Map<string, number>()

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
        this.activeSessionId = opts.sessionId

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
            if (!storageReady) {
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
                best = { sessionId: info.id, score: diff }
            }
        }

        if (best) {
            await this.setActiveSession(best.sessionId)
            return
        }

        if (Date.now() > this.matchDeadlineMs) {
            const message = `No OpenCode session found within ${this.sessionStartWindowMs}ms for cwd ${this.targetCwd}`
            logger.warn(`[opencode-storage] ${message}`)
            this.matchFailed = true
            this.onSessionMatchFailed?.(message)
        }
    }

    private async setActiveSession(sessionId: string): Promise<void> {
        if (this.activeSessionId === sessionId) {
            return
        }
        this.activeSessionId = sessionId
        this.messageRoles.clear()
        this.messageFileMtime.clear()
        this.partFileMtime.clear()
        await primeSessionFiles(
            {
                storageDir: this.storageDir,
                onEvent: this.onEvent,
                messageRoles: this.messageRoles,
                messageFileMtime: this.messageFileMtime,
                partFileMtime: this.partFileMtime,
            },
            sessionId,
            this.referenceTimestampMs,
            REPLAY_CLOCK_SKEW_MS
        )
        this.onDiscoveredSessionId?.(sessionId)
        logger.debug(`[opencode-storage] Tracking session ${sessionId}`)
    }

    private async scanMessagesAndParts(sessionId: string): Promise<void> {
        await scanMessagesAndParts(
            {
                storageDir: this.storageDir,
                onEvent: this.onEvent,
                messageRoles: this.messageRoles,
                messageFileMtime: this.messageFileMtime,
                partFileMtime: this.partFileMtime,
            },
            sessionId
        )
    }
}
