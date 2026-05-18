import type { LocalHubPairingClient } from './localHubPairingClient'
import { serializePairingSyncEvent } from './pairingPeerRpcCore'

export type PairingEventSink = {
    readonly readyState: RTCDataChannelState | number
    send(data: string): void
}

function canSend(sink: PairingEventSink): boolean {
    return sink.readyState === 'open' || sink.readyState === 1
}

export async function startPairingEventStream(
    client: LocalHubPairingClient,
    sink: PairingEventSink,
    abortController: AbortController
): Promise<void> {
    await client.streamEvents({
        signal: abortController.signal,
        onPayload: (payload) => {
            if (payload.type === 'event' && canSend(sink)) {
                sink.send(serializePairingSyncEvent(payload.event))
            }
        },
    })
}
