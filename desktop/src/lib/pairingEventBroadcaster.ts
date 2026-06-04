import type { SyncEvent } from '@viby/protocol/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import { canSendPairingPeerText, type PairingPeerTextSink, sendPairingPeerText } from './pairingBridgeControllerSupport'
import { createPairingEventReplay, type PairingEventReplay, type PairingReplayResult } from './pairingEventReplay'

export type PairingEventBroadcaster = {
    addSink(id: string, sink: PairingPeerTextSink, reportError: (error: unknown) => void): () => void
    dispose(): void
    lastSeq(): number
    replayAfter(
        lastSeenSeq: number,
        sink: PairingPeerTextSink,
        reportError: (error: unknown) => void
    ): PairingReplayResult
}

type SinkEntry = {
    sink: PairingPeerTextSink
    reportError: (error: unknown) => void
}

export function createPairingEventBroadcaster(options: {
    getClient: () => LocalHubPairingClient
    replay?: PairingEventReplay
    reportError: (error: unknown) => void
}): PairingEventBroadcaster {
    const replay = options.replay ?? createPairingEventReplay()
    const sinks = new Map<string, SinkEntry>()
    let streamAbort: AbortController | null = null

    function sendToSinks(wire: string): void {
        for (const entry of sinks.values()) {
            if (canSendPairingPeerText(entry.sink)) {
                void sendPairingPeerText(entry.sink, wire, 'interactive').catch(entry.reportError)
            }
        }
    }

    function handleEvent(event: SyncEvent): void {
        sendToSinks(replay.record(event))
    }

    function ensureStream(): void {
        if (streamAbort || sinks.size === 0) return
        const abortController = new AbortController()
        streamAbort = abortController
        void options
            .getClient()
            .streamEvents({
                signal: abortController.signal,
                onPayload: (payload) => {
                    if (payload.type === 'event') handleEvent(payload.event)
                },
            })
            .catch((error) => {
                if (!abortController.signal.aborted) options.reportError(error)
            })
            .finally(() => {
                if (streamAbort === abortController) streamAbort = null
            })
    }

    function stopStreamIfIdle(): void {
        if (sinks.size > 0) return
        streamAbort?.abort()
        streamAbort = null
    }

    return {
        addSink(id, sink, reportError) {
            sinks.set(id, { sink, reportError })
            ensureStream()
            return () => {
                if (sinks.get(id)?.sink === sink) sinks.delete(id)
                stopStreamIfIdle()
            }
        },
        dispose() {
            sinks.clear()
            stopStreamIfIdle()
        },
        lastSeq: replay.lastSeq,
        replayAfter: replay.replayAfter,
    }
}
