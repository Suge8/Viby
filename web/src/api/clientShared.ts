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
            code: typeof parsed.code === 'string' ? parsed.code : undefined
        }
    } catch {
        return {}
    }
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
