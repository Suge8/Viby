import type { PiRpcResponse } from './piRpcProtocol'

type PendingRequest = {
    timeout: ReturnType<typeof setTimeout> | null
    resolve: (value: PiRpcResponse) => void
    reject: (error: Error) => void
}

export type PiRpcPreparedRequest = {
    id: string
    line: string
    response: Promise<PiRpcResponse>
}

export class PiRpcPendingRequests {
    private pending = new Map<string, PendingRequest>()
    private nextId = 1

    create(command: string, payload: Record<string, unknown>, timeoutMs: number | null): PiRpcPreparedRequest {
        const id = String(this.nextId++)
        const line = `${JSON.stringify({ ...payload, id, type: command })}\n`
        const response = new Promise<PiRpcResponse>((resolve, reject) => {
            const timeout = this.createTimeout(id, command, timeoutMs, reject)
            this.pending.set(id, { timeout, resolve, reject })
        })
        return { id, line, response }
    }

    resolve(response: PiRpcResponse): boolean {
        if (!response.id) return false
        const pending = this.pending.get(response.id)
        if (!pending) return false
        this.pending.delete(response.id)
        this.clearPendingTimeout(pending)
        pending.resolve(response)
        return true
    }

    cancel(id: string): void {
        const pending = this.pending.get(id)
        if (!pending) return
        this.clearPendingTimeout(pending)
        this.pending.delete(id)
    }

    rejectAll(error: Error): void {
        for (const pending of this.pending.values()) {
            this.clearPendingTimeout(pending)
            pending.reject(error)
        }
        this.pending.clear()
    }

    private createTimeout(
        id: string,
        command: string,
        timeoutMs: number | null,
        reject: (error: Error) => void
    ): ReturnType<typeof setTimeout> | null {
        if (timeoutMs === null) return null
        const timeout = setTimeout(() => {
            this.pending.delete(id)
            reject(new Error(`Pi RPC ${command} timed out`))
        }, timeoutMs)
        timeout.unref?.()
        return timeout
    }

    private clearPendingTimeout(pending: PendingRequest): void {
        if (pending.timeout) clearTimeout(pending.timeout)
    }
}
