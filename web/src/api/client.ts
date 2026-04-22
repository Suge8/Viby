import type { Session } from '@/types/api'
import { createApiClientAutocompleteMethods } from './clientAutocompleteMethods'
import { createApiClientPushMethods } from './clientPushMethods'
import { createApiClientRuntimeMethods } from './clientRuntimeMethods'
import { createApiClientSessionMethods } from './clientSessionMethods'
import {
    isSessionActionLegacyResponse,
    isSessionActionResponse,
    type SessionSnapshotAction,
} from './clientSessionSupport'
import { ApiError, buildApiUrl, parseErrorPayload } from './clientShared'
import { createApiClientWorkspaceMethods } from './clientWorkspaceMethods'

export { ApiError } from './clientShared'

const API_REQUEST_TIMEOUT_MS = 15_000
const API_UPLOAD_REQUEST_TIMEOUT_MS = 60_000

export type ApiRequestInit = RequestInit & {
    timeoutMs?: number
}

type ApiClientOptions = {
    baseUrl?: string
    getToken?: () => string | null
    onUnauthorized?: () => Promise<string | null>
}

function resolveRequestToken(
    currentToken: string,
    liveToken: string | null,
    overrideToken?: string | null
): string | null {
    if (overrideToken !== undefined) {
        return overrideToken ?? liveToken ?? currentToken
    }

    return liveToken ?? currentToken
}

function buildApiErrorDetail(message: string | null | undefined, body: string): string {
    if (message) {
        return `: ${message}`
    }
    if (body) {
        return `: ${body}`
    }

    return ''
}

function shouldSetJsonContentType(body: RequestInit['body']): boolean {
    return body !== undefined && !(body instanceof FormData)
}

function resolveRequestTimeoutMs(init?: ApiRequestInit): number {
    if (typeof init?.timeoutMs === 'number' && Number.isFinite(init.timeoutMs) && init.timeoutMs > 0) {
        return init.timeoutMs
    }

    return init?.body instanceof FormData ? API_UPLOAD_REQUEST_TIMEOUT_MS : API_REQUEST_TIMEOUT_MS
}

function createRequestSignal(
    sourceSignal: AbortSignal | null | undefined,
    timeoutMs: number
): {
    signal: AbortSignal | undefined
    cleanup: () => void
    timedOut: () => boolean
} {
    if (typeof AbortController === 'undefined') {
        return {
            signal: sourceSignal ?? undefined,
            cleanup: () => {},
            timedOut: () => false,
        }
    }

    const controller = new AbortController()
    let timedOut = false
    let sourceAbortHandler: (() => void) | null = null

    if (sourceSignal) {
        if (sourceSignal.aborted) {
            controller.abort(sourceSignal.reason)
        } else {
            sourceAbortHandler = () => {
                controller.abort(sourceSignal.reason)
            }
            sourceSignal.addEventListener('abort', sourceAbortHandler, { once: true })
        }
    }

    const timeoutId = setTimeout(() => {
        timedOut = true
        controller.abort(new Error(`Request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeoutId)
            if (sourceSignal && sourceAbortHandler) {
                sourceSignal.removeEventListener('abort', sourceAbortHandler)
            }
        },
        timedOut: () => timedOut,
    }
}

export type ApiClientRequest = <T>(path: string, init?: ApiRequestInit) => Promise<T>
export type ApiClientUnknownRequest = (path: string, init?: RequestInit) => Promise<unknown>
export type ApiClientFetchSessionSnapshot = (sessionId: string) => Promise<Session>
export type ApiClientResolveSessionActionSnapshotResponse = (
    response: unknown,
    sessionId: string,
    action: string
) => Promise<Session>

export class ApiClient {
    private token: string
    private readonly baseUrl: string | null
    private readonly getToken: (() => string | null) | null
    private readonly onUnauthorized: (() => Promise<string | null>) | null

    constructor(token: string, options?: ApiClientOptions) {
        this.token = token
        this.baseUrl = options?.baseUrl ?? null
        this.getToken = options?.getToken ?? null
        this.onUnauthorized = options?.onUnauthorized ?? null

        const request = this.request.bind(this) as ApiClientRequest
        const requestUnknown: ApiClientUnknownRequest = async (path, init) => {
            return await this.request<unknown>(path, init)
        }
        const fetchSessionSnapshot = this.fetchSessionSnapshot.bind(this)
        const resolveSessionActionSnapshotResponse = this.resolveSessionActionSnapshotResponse.bind(this)

        Object.assign(
            this,
            createApiClientSessionMethods({
                request,
                requestUnknown,
                fetchSessionSnapshot,
                resolveSessionActionSnapshotResponse,
            }),
            createApiClientPushMethods(request),
            createApiClientWorkspaceMethods(request),
            createApiClientRuntimeMethods(request, fetchSessionSnapshot),
            createApiClientAutocompleteMethods(request)
        )
    }

    private buildUrl(path: string): string {
        return buildApiUrl(this.baseUrl, path)
    }

    private async request<T>(
        path: string,
        init?: ApiRequestInit,
        attempt: number = 0,
        overrideToken?: string | null
    ): Promise<T> {
        const headers = new Headers(init?.headers)
        const liveToken = this.getToken ? this.getToken() : null
        const authToken = resolveRequestToken(this.token, liveToken, overrideToken)
        if (authToken) {
            headers.set('authorization', `Bearer ${authToken}`)
        }
        if (shouldSetJsonContentType(init?.body) && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const timeoutMs = resolveRequestTimeoutMs(init)
        const requestSignal = createRequestSignal(init?.signal ?? null, timeoutMs)
        let response: Response
        const { timeoutMs: _timeoutMs, ...requestInit } = init ?? {}

        try {
            response = await fetch(this.buildUrl(path), {
                ...requestInit,
                headers,
                signal: requestSignal.signal,
            })
        } catch (error) {
            requestSignal.cleanup()
            if (requestSignal.timedOut()) {
                throw new Error(`Request timed out after ${timeoutMs}ms`)
            }
            throw error
        }
        requestSignal.cleanup()

        if (response.status === 401) {
            if (attempt === 0 && this.onUnauthorized) {
                const refreshed = await this.onUnauthorized()
                if (refreshed) {
                    this.token = refreshed
                    return await this.request<T>(path, init, attempt + 1, refreshed)
                }
            }
            throw new Error('Session expired. Please sign in again.')
        }

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            const parsed = parseErrorPayload(body)
            const detail = buildApiErrorDetail(parsed.message, body)
            throw new ApiError(
                `HTTP ${response.status} ${response.statusText}${detail}`,
                response.status,
                parsed.code,
                body || undefined
            )
        }

        return (await response.json()) as T
    }

    private async fetchSessionSnapshot(sessionId: string): Promise<Session> {
        return (await this.getSession(sessionId)).session
    }

    private async resolveSessionActionSnapshotResponse(
        response: unknown,
        sessionId: string,
        action: string
    ): Promise<Session> {
        if (isSessionActionResponse(response)) {
            return response.session
        }
        if (isSessionActionLegacyResponse(response)) {
            return await this.fetchSessionSnapshot(sessionId)
        }

        throw new Error(`Invalid session action response for ${action}`)
    }
}

export interface ApiClient extends ReturnType<typeof createApiClientSessionMethods> {}
export interface ApiClient extends ReturnType<typeof createApiClientPushMethods> {}
export interface ApiClient extends ReturnType<typeof createApiClientWorkspaceMethods> {}
export interface ApiClient extends ReturnType<typeof createApiClientRuntimeMethods> {}
export interface ApiClient extends ReturnType<typeof createApiClientAutocompleteMethods> {}
