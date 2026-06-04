type IdleRuntimeStopOptions = {
    delayMs?: number
    isThinking: () => boolean
    hasStopHandler: () => boolean
    hasStopInFlight: () => boolean
    queueSize: () => number
    requestStop: () => Promise<boolean>
    onStopRequest?: () => void
    onStopError?: (error: unknown) => void
}

export class IdleRuntimeStopController {
    private timer: NodeJS.Timeout | null = null
    private armed = false

    constructor(private readonly options: IdleRuntimeStopOptions) {}

    markTurnActive(): void {
        this.armed = true
    }

    schedule(): void {
        this.cancel()
        if (!this.canSchedule()) {
            return
        }

        this.timer = setTimeout(() => {
            if (!this.options.isThinking() && this.options.queueSize() === 0) {
                this.options.onStopRequest?.()
                const stopRequest = this.options.requestStop()
                stopRequest.catch((error) => {
                    this.options.onStopError?.(error)
                })
            }
        }, this.options.delayMs)
        this.timer.unref?.()
    }

    cancel(): void {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
    }

    private canSchedule(): boolean {
        return Boolean(
            this.isPositiveDelay() &&
                this.armed &&
                !this.options.isThinking() &&
                !this.options.hasStopInFlight() &&
                this.options.hasStopHandler()
        )
    }

    private isPositiveDelay(): boolean {
        return (
            typeof this.options.delayMs === 'number' &&
            Number.isFinite(this.options.delayMs) &&
            this.options.delayMs > 0
        )
    }
}
