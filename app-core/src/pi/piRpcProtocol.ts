export type PiRpcSuccessResponse = { id?: string; type: 'response'; command: string; success: true; data?: unknown }
export type PiRpcFailureResponse = { id?: string; type: 'response'; command: string; success: false; error: string }
export type PiRpcResponse = PiRpcSuccessResponse | PiRpcFailureResponse
export type PiRpcEventListener = (event: Record<string, unknown>) => void

export class PiRpcConnectionError extends Error {
    readonly name = 'PiRpcConnectionError'
}

export function isPiRpcConnectionError(error: unknown): error is PiRpcConnectionError {
    return error instanceof PiRpcConnectionError
}

export function toPiRpcConnectionError(error: Error): PiRpcConnectionError {
    return error instanceof PiRpcConnectionError ? error : new PiRpcConnectionError(error.message)
}

export function isPiRpcFailure(response: PiRpcResponse): response is PiRpcFailureResponse {
    return response.success === false
}

export class PiRpcJsonlReader {
    private buffer = ''

    constructor(private readonly onLine: (line: string) => void) {}

    push(chunk: string): void {
        this.buffer += chunk
        while (true) {
            const newlineIndex = this.buffer.indexOf('\n')
            if (newlineIndex === -1) return
            this.emitBufferedLine(newlineIndex)
        }
    }

    end(): void {
        if (!this.buffer.trim()) return
        const line = this.buffer
        this.buffer = ''
        this.onLine(line)
    }

    private emitBufferedLine(newlineIndex: number): void {
        const line = this.buffer.slice(0, newlineIndex)
        this.buffer = this.buffer.slice(newlineIndex + 1)
        this.onLine(line)
    }
}
