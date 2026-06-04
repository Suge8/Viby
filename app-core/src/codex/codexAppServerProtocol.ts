export type JsonRpcLiteRequest = {
    id: number
    method: string
    params?: unknown
}

export type JsonRpcLiteNotification = {
    method: string
    params?: unknown
}

export type JsonRpcLiteResponse = {
    id: number | string | null
    result?: unknown
    error?: {
        code?: number
        message: string
        data?: unknown
    }
}

export type RequestHandler = (params: unknown) => Promise<unknown> | unknown

export type PendingRequest = {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    cleanup: () => void
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    return value as Record<string, unknown>
}

export function createAbortError(): Error {
    const error = new Error('Request aborted')
    error.name = 'AbortError'
    return error
}
