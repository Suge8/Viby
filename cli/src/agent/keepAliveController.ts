const KEEP_ALIVE_BUSY_INTERVAL_MS = 2_000
const KEEP_ALIVE_IDLE_INTERVAL_MS = 10_000

type KeepAliveControllerOptions = {
    emit: () => void
}

export class KeepAliveController {
    private timer: NodeJS.Timeout | null = null

    constructor(private readonly options: KeepAliveControllerOptions) {}

    flush(thinking: boolean): void {
        this.options.emit()
        this.schedule(thinking)
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
    }

    private schedule(thinking: boolean): void {
        this.stop()
        const intervalMs = thinking ? KEEP_ALIVE_BUSY_INTERVAL_MS : KEEP_ALIVE_IDLE_INTERVAL_MS
        this.timer = setTimeout(() => this.flush(thinking), intervalMs)
        this.timer.unref?.()
    }
}
