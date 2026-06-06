import type { PairingHostEvent } from '@viby/protocol/pairing'
import { buildPairingHostEventFromStore } from './hostEventPayload'
import type { PairingSessionEventBus } from './sessionEventBus'
import type { PairingStore } from './storeTypes'

const HOST_EVENT_KEEPALIVE_INTERVAL_MS = 25_000

type HostEventStreamState = {
    abort: () => void
    keepaliveTimer: ReturnType<typeof setTimeout> | null
    queuedEvents: PairingHostEvent[]
    signal: AbortSignal
    unsubscribe: (() => void) | null
    wake: (() => void) | null
}

export type PairingHostEventStreamItem = { type: 'event'; event: PairingHostEvent } | { type: 'keepalive' }

export type PairingHostEventStreamOptions = {
    pairingId: string
    store: PairingStore
    eventBus: PairingSessionEventBus
    getActiveRemoteConnectionIds?: (pairingId: string) => ReadonlySet<string>
    signal: AbortSignal
    keepaliveIntervalMs?: number
}

export async function* createPairingHostEventStream(
    options: PairingHostEventStreamOptions
): AsyncIterableIterator<PairingHostEventStreamItem> {
    const state = createHostEventStreamState(options)
    if (!state) return

    try {
        const session = await options.store.getSession(options.pairingId)
        if (options.signal.aborted) return
        if (session) {
            const event = await buildPairingHostEventFromStore(
                options.store,
                session,
                options.getActiveRemoteConnectionIds
            )
            if (options.signal.aborted) return
            yield { type: 'event', event }
        }

        while (!options.signal.aborted) {
            const event = state.queuedEvents.shift()
            if (event) {
                yield { type: 'event', event }
                continue
            }

            const waitResult = await waitForStreamSignal(
                state,
                options.keepaliveIntervalMs ?? HOST_EVENT_KEEPALIVE_INTERVAL_MS
            )
            clearKeepaliveTimer(state)
            if (options.signal.aborted) return
            if (waitResult === 'keepalive' && state.queuedEvents.length === 0) yield { type: 'keepalive' }
        }
    } finally {
        cleanupHostEventStreamState(state)
    }
}

function createHostEventStreamState(options: PairingHostEventStreamOptions): HostEventStreamState | null {
    if (options.signal.aborted) return null

    const state: HostEventStreamState = {
        abort: () => {},
        keepaliveTimer: null,
        queuedEvents: [],
        signal: options.signal,
        unsubscribe: null,
        wake: null,
    }
    state.abort = () => {
        resolveWake(state)
        cleanupHostEventStreamState(state)
    }
    state.unsubscribe = options.eventBus.subscribe(options.pairingId, (event) => {
        state.queuedEvents.push(event)
        resolveWake(state)
    })
    options.signal.addEventListener('abort', state.abort, { once: true })

    return state
}

function waitForStreamSignal(state: HostEventStreamState, keepaliveIntervalMs: number): Promise<'wake' | 'keepalive'> {
    return new Promise((resolve) => {
        state.wake = () => {
            state.wake = null
            resolve('wake')
        }
        state.keepaliveTimer = setTimeout(() => {
            state.keepaliveTimer = null
            state.wake = null
            resolve('keepalive')
        }, keepaliveIntervalMs)
    })
}

function resolveWake(state: HostEventStreamState): void {
    const wake = state.wake
    state.wake = null
    wake?.()
}

function clearKeepaliveTimer(state: HostEventStreamState): void {
    if (!state.keepaliveTimer) return
    clearTimeout(state.keepaliveTimer)
    state.keepaliveTimer = null
}

function cleanupHostEventStreamState(state: HostEventStreamState): void {
    clearKeepaliveTimer(state)
    state.signal.removeEventListener('abort', state.abort)
    state.unsubscribe?.()
    state.unsubscribe = null
}
