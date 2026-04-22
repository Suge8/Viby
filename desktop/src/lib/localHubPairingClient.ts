import type { DecryptedMessage, Session, SessionSummary, SessionViewSnapshot, SyncEvent } from '@viby/protocol/types'

type PairingEventStreamHeartbeat = {
    type: 'heartbeat'
    at: number
}

type PairingEventStreamEvent = {
    type: 'event'
    event: SyncEvent
}

export type PairingEventStreamPayload = PairingEventStreamHeartbeat | PairingEventStreamEvent

type FetchLike = typeof fetch

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

export class LocalHubPairingClient {
    private readonly baseUrl: string
    private readonly cliApiToken: string
    private readonly fetchImpl: FetchLike
    private jwtToken: string | null = null

    constructor(options: {
        baseUrl: string
        cliApiToken: string
        fetchImpl?: FetchLike
    }) {
        this.baseUrl = trimBaseUrl(options.baseUrl)
        this.cliApiToken = options.cliApiToken
        this.fetchImpl = options.fetchImpl ?? fetch
    }

    async listSessions(): Promise<SessionSummary[]> {
        const response = await this.requestJson<{ sessions: SessionSummary[] }>('/api/sessions')
        return response.sessions
    }

    async openSession(sessionId: string): Promise<SessionViewSnapshot> {
        return await this.requestJson<SessionViewSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/view`)
    }

    async resumeSession(sessionId: string): Promise<SessionViewSnapshot> {
        await this.requestJson(`/api/sessions/${encodeURIComponent(sessionId)}/resume`, {
            method: 'POST',
        })
        return await this.openSession(sessionId)
    }

    async loadMessagesAfter(
        sessionId: string,
        afterSeq: number,
        limit: number
    ): Promise<{
        messages: DecryptedMessage[]
        nextAfterSeq: number
    }> {
        const response = await this.requestJson<{ messages: DecryptedMessage[] }>(
            `/api/sessions/${encodeURIComponent(sessionId)}/messages?afterSeq=${afterSeq}&limit=${limit}`
        )

        const nextAfterSeq = response.messages.reduce((cursor, message) => {
            return typeof message.seq === 'number' && message.seq > cursor ? message.seq : cursor
        }, afterSeq)

        return {
            messages: response.messages,
            nextAfterSeq,
        }
    }

    async sendMessage(sessionId: string, text: string, localId?: string): Promise<Session> {
        const response = await this.requestJson<{ session: Session }>(
            `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
            {
                method: 'POST',
                body: JSON.stringify({
                    text,
                    ...(localId ? { localId } : {}),
                }),
            }
        )

        return response.session
    }

    async streamEvents(options: {
        signal: AbortSignal
        onPayload: (payload: PairingEventStreamPayload) => void
    }): Promise<void> {
        await this.streamEventsAttempt(options, true)
    }

    private async streamEventsAttempt(
        options: {
            signal: AbortSignal
            onPayload: (payload: PairingEventStreamPayload) => void
        },
        allowRetry: boolean
    ): Promise<void> {
        const token = await this.authenticate()
        const response = await this.fetchImpl(`${this.baseUrl}/api/pairing/events`, {
            method: 'GET',
            headers: {
                authorization: `Bearer ${token}`,
            },
            signal: options.signal,
        })

        if (response.status === 401 && allowRetry) {
            this.jwtToken = null
            await this.streamEventsAttempt(options, false)
            return
        }

        if (!response.ok) {
            const bodyText = await response.text().catch(() => '')
            throw new Error(parseErrorMessage(response.status, bodyText))
        }

        const reader = response.body?.getReader()
        if (!reader) {
            throw new Error('Pairing event stream did not provide a readable body.')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        try {
            while (true) {
                const chunk = await reader.read()
                if (chunk.done) {
                    return
                }

                buffer += decoder.decode(chunk.value, { stream: true })
                let newlineIndex = buffer.indexOf('\n')
                while (newlineIndex >= 0) {
                    const rawLine = buffer.slice(0, newlineIndex).trim()
                    buffer = buffer.slice(newlineIndex + 1)

                    if (rawLine) {
                        options.onPayload(JSON.parse(rawLine) as PairingEventStreamPayload)
                    }

                    newlineIndex = buffer.indexOf('\n')
                }
            }
        } finally {
            await reader.cancel().catch(() => {})
        }
    }

    private async requestJson<T>(path: string, init?: RequestInit, allowRetry: boolean = true): Promise<T> {
        const token = await this.authenticate()
        const headers = new Headers(init?.headers)
        headers.set('authorization', `Bearer ${token}`)
        if (init?.body && !headers.has('content-type')) {
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

    private async authenticate(): Promise<string> {
        if (this.jwtToken) {
            return this.jwtToken
        }

        const response = await this.fetchImpl(`${this.baseUrl}/api/auth`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                accessToken: this.cliApiToken,
            }),
        })

        const bodyText = await response.text().catch(() => '')
        if (!response.ok) {
            throw new Error(parseErrorMessage(response.status, bodyText))
        }

        const parsed = JSON.parse(bodyText) as { token?: string }
        if (!parsed.token) {
            throw new Error('Local Hub auth response did not include a token.')
        }

        this.jwtToken = parsed.token
        return parsed.token
    }
}
