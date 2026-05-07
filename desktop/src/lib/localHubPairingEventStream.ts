export type PairingEventStreamHeartbeat = {
    type: 'heartbeat'
    at: number
}

export type PairingEventStreamEvent<TEvent> = {
    type: 'event'
    event: TEvent
}

export type PairingEventStreamPayload<TEvent = unknown> = PairingEventStreamHeartbeat | PairingEventStreamEvent<TEvent>

type FetchLike = typeof fetch

export async function streamLocalHubPairingEvents<TEvent>(options: {
    baseUrl: string
    fetchImpl: FetchLike
    signal: AbortSignal
    authenticate: () => Promise<string>
    resetAuth: () => void
    parseErrorMessage: (status: number, bodyText: string) => string
    onPayload: (payload: PairingEventStreamPayload<TEvent>) => void
}): Promise<void> {
    await streamLocalHubPairingEventsAttempt(options, true)
}

async function streamLocalHubPairingEventsAttempt<TEvent>(
    options: {
        baseUrl: string
        fetchImpl: FetchLike
        signal: AbortSignal
        authenticate: () => Promise<string>
        resetAuth: () => void
        parseErrorMessage: (status: number, bodyText: string) => string
        onPayload: (payload: PairingEventStreamPayload<TEvent>) => void
    },
    allowRetry: boolean
): Promise<void> {
    const token = await options.authenticate()
    const response = await options.fetchImpl(`${options.baseUrl}/api/pairing/events`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        signal: options.signal,
    })

    if (response.status === 401 && allowRetry) {
        options.resetAuth()
        await streamLocalHubPairingEventsAttempt(options, false)
        return
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '')
        throw new Error(options.parseErrorMessage(response.status, bodyText))
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
                    options.onPayload(JSON.parse(rawLine) as PairingEventStreamPayload<TEvent>)
                }
                newlineIndex = buffer.indexOf('\n')
            }
        }
    } finally {
        await reader.cancel().catch(() => {})
    }
}
