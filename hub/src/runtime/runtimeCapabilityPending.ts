type PendingRefresh = { force: boolean; promise: Promise<void> }

export class RuntimeCapabilityPendingRefreshes {
    private readonly pending = new Map<string, PendingRefresh>()

    has(key: string): boolean {
        return this.pending.has(key)
    }

    start(key: string, force: boolean, run: () => Promise<void>): Promise<void> {
        const existing = this.pending.get(key)
        if (existing) {
            if (!force || existing.force) return existing.promise
            return this.queueForced(key, existing, run)
        }

        const pending = this.create(key, force, run())
        this.pending.set(key, pending)
        return pending.promise
    }

    private queueForced(key: string, existing: PendingRefresh, run: () => Promise<void>): Promise<void> {
        const pending = this.create(key, true, existing.promise.then(run, run))
        this.pending.set(key, pending)
        return pending.promise
    }

    private create(key: string, force: boolean, promise: Promise<void>): PendingRefresh {
        const pending: PendingRefresh = {
            force,
            promise: promise.finally(() => {
                if (this.pending.get(key) === pending) this.pending.delete(key)
            }),
        }
        return pending
    }
}
