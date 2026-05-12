import type { LocalHubPairingClient } from './localHubPairingClient'
import { serializePairingSyncEvent } from './pairingPeerRpcCore'

export async function startPairingEventStream(
    client: LocalHubPairingClient,
    activeChannel: RTCDataChannel,
    abortController: AbortController
): Promise<void> {
    await client.streamEvents({
        signal: abortController.signal,
        onPayload: (payload) => {
            if (payload.type === 'event' && activeChannel.readyState === 'open') {
                activeChannel.send(serializePairingSyncEvent(payload.event))
            }
        },
    })
}
