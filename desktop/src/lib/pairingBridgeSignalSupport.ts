import type { PairingBridgeState, PairingSessionSnapshot } from '@/types'
import { describePairingConnectionState, describePairingSnapshotMessage } from './pairingBridgeSupport'

export type GuestReadyTransport = { fromGuest: boolean; transportId: string | null; knownTransportId: string | null }

export function hasLiveDataChannel(
    activePeer: RTCPeerConnection,
    channel: RTCDataChannel | null | undefined,
    channelHealthy: boolean
): boolean {
    return (
        channelHealthy &&
        channel?.readyState === 'open' &&
        activePeer.connectionState !== 'failed' &&
        activePeer.connectionState !== 'closed'
    )
}

export function resolveSignalPhase(
    activePeer: RTCPeerConnection,
    channel: RTCDataChannel | null | undefined,
    channelHealthy: boolean
): PairingBridgeState['phase'] {
    return hasLiveDataChannel(activePeer, channel, channelHealthy) ? 'ready' : 'connecting'
}

export function isClosedChannel(channel: RTCDataChannel | null | undefined): boolean {
    return channel?.readyState === 'closed'
}

export function isHealthyGuestTransport(options: {
    signal: { from?: string }
    activePeer: RTCPeerConnection
    channel: RTCDataChannel | null | undefined
    channelHealthy: boolean
}): boolean {
    return (
        options.signal.from === 'guest' &&
        hasLiveDataChannel(options.activePeer, options.channel, options.channelHealthy)
    )
}

export function shouldRebuildForGuestReady(options: GuestReadyTransport): boolean {
    return (
        options.fromGuest &&
        options.knownTransportId !== null &&
        Boolean(options.transportId) &&
        options.transportId !== options.knownTransportId
    )
}

export function resolveSignalMessage(
    activePeer: RTCPeerConnection,
    pairing: PairingSessionSnapshot,
    channel: RTCDataChannel | null | undefined,
    channelHealthy: boolean
): string {
    if (hasLiveDataChannel(activePeer, channel, channelHealthy)) return describePairingConnectionState('connected')
    if (channel) return '正在建立点对点链路。'
    return describePairingSnapshotMessage(pairing)
}

export function readSignalCandidate(payload: unknown): RTCIceCandidateInit | null {
    if (!payload || typeof payload !== 'object') return payload as RTCIceCandidateInit | null
    if ('candidate' in payload && payload.candidate && typeof payload.candidate === 'object') {
        return payload.candidate as RTCIceCandidateInit
    }
    return payload as RTCIceCandidateInit
}
