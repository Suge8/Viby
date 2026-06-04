import type { Metadata } from '@/api/types'
import type { ProviderAdapterBridge } from './providerAdapterBridge'
import { handleProviderAdapterStdoutLine } from './providerAdapterStdout'

const DEFAULT_MAX_LINE_BYTES = 1024 * 1024
const PAUSE_PENDING_LINES = 256
const RESUME_PENDING_LINES = 64

export type ProviderAdapterStdoutProcessorOptions = {
    bridge: ProviderAdapterBridge
    onSessionStarted: (sessionId: string, metadata: Metadata) => void
    onFatal: (message: string) => void
    pause?: () => void
    resume?: () => void
    maxLineBytes?: number
}

export class ProviderAdapterStdoutProcessor {
    private readonly bridge: ProviderAdapterBridge
    private readonly onSessionStarted: (sessionId: string, metadata: Metadata) => void
    private readonly onFatal: (message: string) => void
    private readonly pause?: () => void
    private readonly resume?: () => void
    private readonly maxLineBytes: number
    private buffer = ''
    private fatal = false
    private pendingLines = 0
    private queue: Promise<void> = Promise.resolve()

    constructor(options: ProviderAdapterStdoutProcessorOptions) {
        this.bridge = options.bridge
        this.onSessionStarted = options.onSessionStarted
        this.onFatal = options.onFatal
        this.pause = options.pause
        this.resume = options.resume
        this.maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES
    }

    push(chunk: Buffer | string): void {
        if (this.fatal) return
        this.buffer += chunk.toString()
        const lines = this.buffer.split('\n')
        this.buffer = lines.pop() ?? ''
        for (const line of lines) this.enqueue(line)
        if (this.lineTooLarge(this.buffer))
            this.fail(`Provider adapter stdout line exceeded ${this.maxLineBytes} bytes`)
    }

    finish(): void {
        if (this.fatal || this.buffer.length === 0) return
        this.fail(`Provider adapter stdout ended with a partial line: line=${previewLine(this.buffer)}`)
    }

    dispose(): void {
        this.fatal = true
        this.buffer = ''
        this.resume?.()
    }

    async drain(): Promise<void> {
        await this.queue
    }

    private enqueue(line: string): void {
        if (this.fatal) return
        if (this.lineTooLarge(line)) {
            this.fail(`Provider adapter stdout line exceeded ${this.maxLineBytes} bytes`)
            return
        }
        this.pendingLines += 1
        if (this.pendingLines >= PAUSE_PENDING_LINES) this.pause?.()
        this.queue = this.queue.then(() => this.handle(line))
    }

    private async handle(line: string): Promise<void> {
        try {
            if (this.fatal) return
            const result = await handleProviderAdapterStdoutLine({
                line,
                bridge: this.bridge,
                onSessionStarted: this.onSessionStarted,
            })
            if (result.type === 'fatal') this.fail(result.message)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.fail(`Provider adapter event failed: ${message}`)
        } finally {
            this.pendingLines = Math.max(0, this.pendingLines - 1)
            if (this.pendingLines <= RESUME_PENDING_LINES) this.resume?.()
        }
    }

    private lineTooLarge(line: string): boolean {
        return Buffer.byteLength(line) > this.maxLineBytes
    }

    private fail(message: string): void {
        if (this.fatal) return
        this.fatal = true
        this.buffer = ''
        this.resume?.()
        this.onFatal(message)
    }
}

function previewLine(line: string): string {
    const compact = line.trim().replace(/\s+/g, ' ')
    return JSON.stringify(compact.length > 240 ? `${compact.slice(0, 237)}...` : compact)
}
