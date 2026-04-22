import { logger } from '@/ui/logger'

type QueueItem<T> = {
    message: string
    mode: T
    modeHash: string
    isolate: boolean
}

type MessageBatch<T> = {
    message: string
    mode: T
    hash: string
    isolate: boolean
}

/**
 * A mode-aware message queue that stores messages with their modes.
 * Returns consistent batches of messages with the same mode.
 */
export class MessageQueue2<T> {
    public queue: QueueItem<T>[] = [] // Made public for testing
    private waiter: ((hasMessages: boolean) => void) | null = null
    private closed = false
    private onMessageHandler: ((message: string, mode: T) => void) | null = null

    constructor(
        readonly modeHasher: (mode: T) => string,
        onMessageHandler: ((message: string, mode: T) => void) | null = null
    ) {
        this.onMessageHandler = onMessageHandler
        logger.debug('[MessageQueue2] Initialized')
    }

    setOnMessage(handler: ((message: string, mode: T) => void) | null): void {
        this.onMessageHandler = handler
    }

    push(message: string, mode: T): void {
        this.enqueue(message, mode, { position: 'end', isolate: false, clear: false, label: 'push' })
    }

    pushImmediate(message: string, mode: T): void {
        this.enqueue(message, mode, { position: 'end', isolate: false, clear: false, label: 'pushImmediate' })
    }

    pushIsolateAndClear(message: string, mode: T): void {
        this.enqueue(message, mode, { position: 'end', isolate: true, clear: true, label: 'pushIsolateAndClear' })
    }

    unshift(message: string, mode: T): void {
        this.enqueue(message, mode, { position: 'start', isolate: false, clear: false, label: 'unshift' })
    }

    reset(): void {
        logger.debug(`[MessageQueue2] reset() called. Clearing ${this.queue.length} messages`)
        this.queue = []
        this.closed = false
        this.waiter = null
    }

    close(): void {
        logger.debug('[MessageQueue2] close() called')
        this.closed = true
        this.resolveWaiter(false)
    }

    isClosed(): boolean {
        return this.closed
    }

    size(): number {
        return this.queue.length
    }

    async waitForMessagesAndGetAsString(abortSignal?: AbortSignal): Promise<MessageBatch<T> | null> {
        if (this.queue.length > 0) {
            return this.collectBatch()
        }
        if (this.closed || abortSignal?.aborted) {
            return null
        }
        if (!(await this.waitForMessages(abortSignal))) {
            return null
        }

        return this.collectBatch()
    }

    private enqueue(
        message: string,
        mode: T,
        options: { position: 'start' | 'end'; isolate: boolean; clear: boolean; label: string }
    ): void {
        this.assertOpen(options.position === 'start' ? 'unshift to' : 'push to')

        const item = this.createQueueItem(message, mode, options.isolate)
        const clearSuffix = options.clear ? ` - clearing ${this.queue.length} pending messages` : ''
        logger.debug(`[MessageQueue2] ${options.label}() called with mode hash: ${item.modeHash}${clearSuffix}`)

        if (options.clear) {
            this.queue = []
        }
        if (options.position === 'start') {
            this.queue.unshift(item)
        } else {
            this.queue.push(item)
        }

        this.emitMessage(message, mode)
        this.resolveWaiter(true)
        logger.debug(`[MessageQueue2] ${options.label}() completed. Queue size: ${this.queue.length}`)
    }

    private assertOpen(action: string): void {
        if (this.closed) {
            throw new Error(`Cannot ${action} closed queue`)
        }
    }

    private createQueueItem(message: string, mode: T, isolate: boolean): QueueItem<T> {
        return {
            message,
            mode,
            modeHash: this.modeHasher(mode),
            isolate,
        }
    }

    private emitMessage(message: string, mode: T): void {
        this.onMessageHandler?.(message, mode)
    }

    private resolveWaiter(hasMessages: boolean): void {
        if (!this.waiter) {
            return
        }

        logger.debug(`[MessageQueue2] Notifying waiter${hasMessages ? '' : ' on close'}`)
        const waiter = this.waiter
        this.waiter = null
        waiter(hasMessages)
    }

    private collectBatch(): MessageBatch<T> | null {
        if (this.queue.length === 0) {
            return null
        }

        const firstItem = this.queue[0]
        const messages: string[] = []
        const { mode, modeHash, isolate } = firstItem

        if (isolate) {
            messages.push(this.queue.shift()!.message)
            logger.debug(`[MessageQueue2] Collected isolated message with mode hash: ${modeHash}`)
        } else {
            while (this.queue.length > 0 && this.queue[0].modeHash === modeHash && !this.queue[0].isolate) {
                messages.push(this.queue.shift()!.message)
            }
            logger.debug(`[MessageQueue2] Collected batch of ${messages.length} messages with mode hash: ${modeHash}`)
        }

        return {
            message: messages.join('\n'),
            mode,
            hash: modeHash,
            isolate,
        }
    }

    private waitForMessages(abortSignal?: AbortSignal): Promise<boolean> {
        return new Promise((resolve) => {
            let settled = false
            let waiterFunc: (hasMessages: boolean) => void
            let abortHandler: (() => void) | null = null

            const finish = (hasMessages: boolean) => {
                if (settled) {
                    return
                }
                settled = true
                if (this.waiter === waiterFunc) {
                    this.waiter = null
                }
                if (abortHandler && abortSignal) {
                    abortSignal.removeEventListener('abort', abortHandler)
                }
                resolve(hasMessages)
            }

            waiterFunc = (hasMessages: boolean) => {
                finish(hasMessages)
            }

            if (abortSignal) {
                abortHandler = () => {
                    logger.debug('[MessageQueue2] Wait aborted')
                    finish(false)
                }
                abortSignal.addEventListener('abort', abortHandler)
            }

            this.waiter = waiterFunc
            if (this.queue.length > 0) {
                finish(true)
                return
            }
            if (this.closed || abortSignal?.aborted) {
                finish(false)
                return
            }

            logger.debug('[MessageQueue2] Waiting for messages...')
        })
    }
}
