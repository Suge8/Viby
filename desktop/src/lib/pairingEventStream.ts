import type { LocalHubPairingClient } from './localHubPairingClient'
import { canSendPairingPeerText, type PairingPeerTextSink, sendPairingPeerText } from './pairingBridgeControllerSupport'
import { serializePairingSyncEvent } from './pairingPeerRpcCore'

export type PairingEventSink = PairingPeerTextSink

export async function startPairingEventStream(
    client: LocalHubPairingClient,
    sink: PairingEventSink,
    abortController: AbortController,
    reportError: (error: unknown) => void = () => undefined
): Promise<void> {
    await client.streamEvents({
        signal: abortController.signal,
        onPayload: (payload) => {
            if (payload.type === 'event' && canSendPairingPeerText(sink)) {
                void sendPairingPeerText(sink, serializePairingSyncEvent(payload.event), 'interactive').catch(
                    reportError
                )
            }
        },
    })
}
