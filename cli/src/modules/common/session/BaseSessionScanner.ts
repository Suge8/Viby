import { startFileWatcher } from '@/modules/watcher/startFileWatcher'
import { InvalidateSync } from '@/utils/sync'

export type SessionFileScanEntry<TEvent> = {
    event: TEvent
    lineIndex?: number
}

export type SessionFileScanResult<TEvent> = {
    events: SessionFileScanEntry<TEvent>[]
    nextCursor: number
}

export type SessionFileScanStats<TEvent> = {
    filePath: string
    events: TEvent[]
    parsedCount: number
    newCount: number
    skippedCount: number
    cursor: number
    nextCursor: number
}

type BaseSessionScannerOptions = {
    fallbackIntervalMs: number
}

export abstract class BaseSessionScanner<TEvent> {
    private readonly sync: InvalidateSync
    private readonly watchers = new Map<string, () => void>()
    private readonly processedEventKeys = new Set<string>()
    private readonly fileCursors = new Map<string, number>()
    private fallbackTimer: ReturnType<typeof setTimeout> | null = null
    private stopped = false
    private scanPromise: Promise<void> | null = null

    protected constructor(private readonly options: BaseSessionScannerOptions) {
        this.sync = new InvalidateSync(() => this.scan())
    }

    protected abstract findSessionFiles(): Promise<string[]>
    protected abstract parseSessionFile(filePath: string, cursor: number): Promise<SessionFileScanResult<TEvent>>
    protected abstract generateEventKey(event: TEvent, context: { filePath: string; lineIndex?: number }): string

    protected async handleFileScan(_stats: SessionFileScanStats<TEvent>): Promise<void> {}

    protected async initialize(): Promise<void> {}

    protected async beforeScan(): Promise<void> {}

    protected async afterScan(): Promise<void> {}

    protected shouldScan(): boolean {
        return true
    }

    protected shouldWatchFile(_filePath: string): boolean {
        return true
    }

    protected getFallbackIntervalMs(): number {
        return this.options.fallbackIntervalMs
    }

    protected ensureWatcher(filePath: string): void {
        if (this.watchers.has(filePath)) {
            return
        }
        this.watchers.set(
            filePath,
            startFileWatcher(filePath, () => this.sync.invalidate())
        )
    }

    protected invalidate(): void {
        this.sync.invalidate()
    }

    protected getCursor(filePath: string): number {
        return this.fileCursors.get(filePath) ?? 0
    }

    protected setCursor(filePath: string, cursor: number): void {
        this.fileCursors.set(filePath, cursor)
    }

    protected seedProcessedKeys(keys: Iterable<string>): void {
        for (const key of keys) {
            this.recordProcessedKey(key)
        }
    }

    protected getWatchedFiles(): string[] {
        return [...this.watchers.keys()]
    }

    protected pruneWatchers(keepFiles: Iterable<string>): void {
        const keep = new Set(keepFiles)
        for (const [filePath, stop] of this.watchers.entries()) {
            if (keep.has(filePath)) {
                continue
            }
            stop()
            this.watchers.delete(filePath)
        }
    }

    public async start(): Promise<void> {
        await this.initialize()
        await this.sync.invalidateAndAwait()
        this.scheduleFallbackScan()
    }

    public async cleanup(): Promise<void> {
        this.stopped = true
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer)
            this.fallbackTimer = null
        }
        this.sync.stop()
        const pendingScan = this.scanPromise
        for (const stop of this.watchers.values()) {
            stop()
        }
        this.watchers.clear()
        if (pendingScan) {
            try {
                await pendingScan
            } catch {}
        }
    }

    private async scan(): Promise<void> {
        if (this.stopped || !this.shouldScan()) {
            return
        }
        if (this.scanPromise) {
            return this.scanPromise
        }
        this.scanPromise = this.runScan()
        try {
            await this.scanPromise
        } finally {
            this.scanPromise = null
        }
    }

    private async runScan(): Promise<void> {
        if (this.stopped || !this.shouldScan()) {
            return
        }
        await this.beforeScan()
        const files = await this.findSessionFiles()
        for (const filePath of files) {
            if (this.stopped || !this.shouldScan()) {
                return
            }
            if (this.shouldWatchFile(filePath)) {
                this.ensureWatcher(filePath)
            }
            const cursor = this.getCursor(filePath)
            const { events, nextCursor } = await this.parseSessionFile(filePath, cursor)
            const newEvents: TEvent[] = []
            const newKeys: string[] = []
            for (const entry of events) {
                const key = this.generateEventKey(entry.event, { filePath, lineIndex: entry.lineIndex })
                if (this.processedEventKeys.has(key)) {
                    this.recordProcessedKey(key)
                    continue
                }
                newKeys.push(key)
                newEvents.push(entry.event)
            }
            await this.handleFileScan({
                filePath,
                events: newEvents,
                parsedCount: events.length,
                newCount: newEvents.length,
                skippedCount: events.length - newEvents.length,
                cursor,
                nextCursor,
            })
            this.setCursor(filePath, nextCursor)
            for (const key of newKeys) {
                this.recordProcessedKey(key)
            }
        }
        await this.afterScan()
    }

    private recordProcessedKey(key: string): void {
        this.processedEventKeys.add(key)
    }

    private scheduleFallbackScan(): void {
        if (this.stopped) {
            return
        }
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer)
            this.fallbackTimer = null
        }
        const intervalMs = this.getFallbackIntervalMs()
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
            return
        }
        this.fallbackTimer = setTimeout(() => {
            this.sync.invalidate()
            this.scheduleFallbackScan()
        }, intervalMs)
    }
}
