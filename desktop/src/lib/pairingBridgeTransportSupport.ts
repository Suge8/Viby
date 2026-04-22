import type { DesktopPairingSession, PairingBridgeStats } from '@/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import { serializePairingSyncEvent } from './pairingBridgeCore'

export async function sendPairingOffer(
    activePeer: RTCPeerConnection,
    pairingId: string,
    signalSocket: WebSocket
): Promise<void> {
    const offer = await activePeer.createOffer()
    await activePeer.setLocalDescription(offer)
    signalSocket.send(
        JSON.stringify({
            pairingId,
            type: 'offer',
            to: 'guest',
            payload: offer,
        })
    )
}

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

function toPairingHttpUrl(pairing: DesktopPairingSession, pathname: string): string {
    const url = new URL(pairing.wsUrl)
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
    url.pathname = pathname
    url.search = ''
    return url.toString()
}

export async function postPairingTelemetry(
    pairing: DesktopPairingSession,
    stats: PairingBridgeStats,
    sampledAt: number
): Promise<void> {
    const response = await fetch(toPairingHttpUrl(pairing, `/pairings/${pairing.pairing.id}/telemetry`), {
        method: 'POST',
        headers: {
            authorization: `Bearer ${pairing.hostToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            sample: {
                source: 'desktop',
                transport: stats.transport,
                localCandidateType: stats.localCandidateType,
                remoteCandidateType: stats.remoteCandidateType,
                currentRoundTripTimeMs: stats.currentRoundTripTimeMs,
                restartCount: stats.restartCount,
                sampledAt,
            },
        }),
    })
    if (!response.ok) {
        const payload = await response.text()
        throw new Error(payload || `Broker telemetry request failed with ${response.status}`)
    }
}
