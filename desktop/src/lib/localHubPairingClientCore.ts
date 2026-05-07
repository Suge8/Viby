import type { SyncEvent } from '@viby/protocol/types'
import { authenticateLocalHub } from './localHubPairingAuth'
import {
    type PairingEventStreamPayload as LocalHubPairingEventStreamPayload,
    streamLocalHubPairingEvents,
} from './localHubPairingEventStream'

export type PairingEventStreamPayload = LocalHubPairingEventStreamPayload<SyncEvent>
export type FetchLike = typeof fetch

export type LocalHubPairingClientOptions = {
    baseUrl: string
    cliApiToken: string
    fetchImpl?: FetchLike
}

function createDefaultFetch(): FetchLike {
    return ((input: string | URL | Request, init?: RequestInit) => globalThis.fetch(input, init)) as FetchLike
}

function trimBaseUrl(value: string): string {
    return value.replace(/\/+$/, '')
}

function parseErrorMessage(status: number, bodyText: string): string {
    if (!bodyText) {
        return `Local Hub request failed with HTTP ${status}`
    }

    try {
        const parsed = JSON.parse(bodyText) as { error?: string }
        if (typeof parsed.error === 'string' && parsed.error) {
            return parsed.error
        }
    } catch {
        // Ignore invalid JSON error payloads.
    }

    return `Local Hub request failed with HTTP ${status}: ${bodyText}`
}

export class LocalHubPairingClientCore {
    protected readonly baseUrl: string
    protected readonly fetchImpl: FetchLike
    private readonly cliApiToken: string
    private jwtToken: string | null = null

    constructor(options: LocalHubPairingClientOptions) {
        this.baseUrl = trimBaseUrl(options.baseUrl)
        this.cliApiToken = options.cliApiToken
        this.fetchImpl = options.fetchImpl ?? createDefaultFetch()
    }

    async streamEvents(options: {
        signal: AbortSignal
        onPayload: (payload: PairingEventStreamPayload) => void
    }): Promise<void> {
        await streamLocalHubPairingEvents({
            baseUrl: this.baseUrl,
            fetchImpl: this.fetchImpl,
            signal: options.signal,
            authenticate: () => this.authenticate(),
            resetAuth: () => {
                this.jwtToken = null
            },
            parseErrorMessage,
            onPayload: options.onPayload,
        })
    }

    protected async requestJson<T>(path: string, init?: RequestInit, allowRetry: boolean = true): Promise<T> {
        const token = await this.authenticate()
        const headers = new Headers(init?.headers)
        headers.set('authorization', `Bearer ${token}`)
        const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
        if (init?.body && !isFormData && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            ...init,
            headers,
        })

        if (response.status === 401 && allowRetry) {
            this.jwtToken = null
            return await this.requestJson<T>(path, init, false)
        }

        const bodyText = await response.text().catch(() => '')
        if (!response.ok) {
            throw new Error(parseErrorMessage(response.status, bodyText))
        }

        return bodyText ? (JSON.parse(bodyText) as T) : ({} as T)
    }

    protected async authenticate(): Promise<string> {
        return await authenticateLocalHub({
            jwtToken: this.jwtToken,
            setJwtToken: (token) => {
                this.jwtToken = token
            },
            baseUrl: this.baseUrl,
            cliApiToken: this.cliApiToken,
            fetchImpl: this.fetchImpl,
            parseErrorMessage,
        })
    }
}
