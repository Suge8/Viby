import { asString, isObject } from '@viby/protocol'

export class AcpSessionUpdateTracker {
    private isProcessingMessage = false
    private responseCompleteResolvers: Array<() => void> = []
    private lastSessionUpdateAt = 0

    get processingMessage(): boolean {
        return this.isProcessingMessage
    }

    getLastSessionUpdateAt(): number {
        return this.lastSessionUpdateAt
    }

    startResponse(): void {
        this.isProcessingMessage = true
        this.lastSessionUpdateAt = Date.now()
    }

    completeResponse(): void {
        this.isProcessingMessage = false
        const resolvers = this.responseCompleteResolvers
        this.responseCompleteResolvers = []
        for (const resolve of resolvers) {
            resolve()
        }
    }

    async waitForResponseComplete(): Promise<void> {
        if (!this.isProcessingMessage) {
            return
        }

        await new Promise<void>((resolve) => {
            this.responseCompleteResolvers.push(resolve)
        })
    }

    handleSessionUpdate(params: unknown, activeSessionId: string | null, applyUpdate: (update: unknown) => void): void {
        if (!isObject(params)) {
            return
        }

        const sessionId = asString(params.sessionId)
        if (activeSessionId && sessionId && sessionId !== activeSessionId) {
            return
        }

        this.lastSessionUpdateAt = Date.now()
        applyUpdate(params.update)
    }

    async waitForQuiet(quietMs: number, timeoutMs: number, minimumQuietStartAt = 0): Promise<void> {
        if (quietMs <= 0 || timeoutMs <= 0) {
            return
        }

        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            const quietStartAt = Math.max(this.lastSessionUpdateAt, minimumQuietStartAt)
            const elapsedSinceUpdate = Date.now() - quietStartAt
            if (elapsedSinceUpdate >= quietMs) {
                return
            }

            const remainingToQuiet = quietMs - elapsedSinceUpdate
            const remainingBudget = deadline - Date.now()
            const waitMs = Math.max(1, Math.min(remainingToQuiet, remainingBudget))
            await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
        }
    }
}
