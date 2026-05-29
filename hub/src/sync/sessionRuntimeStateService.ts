export type SessionRuntimeState = 'stopping'
export type SessionRuntimeStopReason = 'idle-timeout' | 'user-request' | 'shutdown'

const DEFAULT_STOPPING_WAIT_TIMEOUT_MS = 5_000

type RuntimeStateWaiter = {
    resolve: () => void
    timer: ReturnType<typeof setTimeout>
}

export class SessionRuntimeStateService {
    private readonly stoppingReasonsBySessionId = new Map<string, SessionRuntimeStopReason | undefined>()
    private readonly waitersBySessionId = new Map<string, Set<RuntimeStateWaiter>>()

    markStopping(sessionId: string, reason?: SessionRuntimeStopReason): void {
        this.stoppingReasonsBySessionId.set(sessionId, reason)
    }

    clear(sessionId: string): void {
        if (!this.stoppingReasonsBySessionId.delete(sessionId)) {
            return
        }
        this.resolveWaiters(sessionId)
    }

    getStoppingReason(sessionId: string): SessionRuntimeStopReason | undefined {
        return this.stoppingReasonsBySessionId.get(sessionId)
    }

    isStopping(sessionId: string): boolean {
        return this.stoppingReasonsBySessionId.has(sessionId)
    }

    async waitUntilNotStopping(sessionId: string, timeoutMs = DEFAULT_STOPPING_WAIT_TIMEOUT_MS): Promise<boolean> {
        if (!this.isStopping(sessionId)) {
            return true
        }

        return await new Promise<boolean>((resolve) => {
            const waiter: RuntimeStateWaiter = {
                resolve: () => resolve(true),
                timer: setTimeout(() => {
                    this.removeWaiter(sessionId, waiter)
                    resolve(false)
                }, timeoutMs),
            }
            waiter.timer.unref?.()
            const waiters = this.waitersBySessionId.get(sessionId) ?? new Set<RuntimeStateWaiter>()
            waiters.add(waiter)
            this.waitersBySessionId.set(sessionId, waiters)
        })
    }

    private resolveWaiters(sessionId: string): void {
        const waiters = this.waitersBySessionId.get(sessionId)
        if (!waiters) {
            return
        }
        this.waitersBySessionId.delete(sessionId)
        for (const waiter of waiters) {
            clearTimeout(waiter.timer)
            waiter.resolve()
        }
    }

    private removeWaiter(sessionId: string, waiter: RuntimeStateWaiter): void {
        const waiters = this.waitersBySessionId.get(sessionId)
        if (!waiters) {
            return
        }
        waiters.delete(waiter)
        if (waiters.size === 0) {
            this.waitersBySessionId.delete(sessionId)
        }
    }
}
