type ErrorPayload = {
    error?: unknown
    code?: unknown
}

export function buildApiUrl(baseUrl: string | null | undefined, path: string): string {
    if (!baseUrl) {
        return path
    }

    try {
        return new URL(path, baseUrl).toString()
    } catch {
        return path
    }
}

export function parseErrorPayload(bodyText: string): { message?: string; code?: string } {
    try {
        const parsed = JSON.parse(bodyText) as ErrorPayload
        return {
            message: typeof parsed.error === 'string' ? parsed.error : undefined,
            code: typeof parsed.code === 'string' ? parsed.code : undefined,
        }
    } catch {
        return {}
    }
}

function getAbortError(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : new Error('Request aborted')
}

export async function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return await promise
    if (signal.aborted) {
        promise.catch(() => undefined)
        throw getAbortError(signal)
    }

    return await new Promise<T>((resolve, reject) => {
        const cleanup = (): void => signal.removeEventListener('abort', abort)
        const abort = (): void => {
            cleanup()
            promise.catch(() => undefined)
            reject(getAbortError(signal))
        }
        signal.addEventListener('abort', abort, { once: true })
        promise.then(
            (value) => {
                cleanup()
                resolve(value)
            },
            (error) => {
                cleanup()
                reject(error)
            }
        )
    })
}

export class ApiError extends Error {
    status: number
    code?: string
    body?: string

    constructor(message: string, status: number, code?: string, body?: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.body = body
    }
}
