import type { PairingByeReason, PairingSignalV2 } from './pairingSignal'
import type { RTCPeerConnection as NegotiationPeer } from './perfectNegotiation'

export type PairingTransportState =
    | { kind: 'connecting'; attempt: number }
    | { kind: 'ready' }
    | { kind: 'fatal'; reason: PairingByeReason | 'closed' }

export type RTCIceServer = { urls: string | string[]; username?: string; credential?: string }
export type RTCDataChannel = { readyState?: string }

export interface PairingSocket {
    readyState: number
    onopen: (() => void) | null
    onclose: (() => void) | null
    onerror: (() => void) | null
    onmessage: ((event: { data: string }) => void) | null
    send(data: string): void
    close(): void
}

export interface PairingPeer extends NegotiationPeer {
    iceConnectionState: string
    connectionState: string
    onicecandidate:
        | ((event: {
              candidate: PairingSignalV2 extends { type: 'candidate'; candidate: infer Candidate }
                  ? Candidate | null
                  : never
          }) => void)
        | null
    onconnectionstatechange: (() => void) | null
    oniceconnectionstatechange: (() => void) | null
    ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null
    createDataChannel(label: string, options: { ordered: boolean }): RTCDataChannel
    restartIce(): void
    close(): void
}

export interface PairingTransportOptions {
    pairingId: string
    polite: boolean
    iceServers: RTCIceServer[]
    getWsUrl(): Promise<string>
    createDataChannel: boolean
    onChannel(channel: RTCDataChannel): void
    onSignalReceived?: (raw: unknown) => void
    socketFactory?: (url: string) => PairingSocket
    peerFactory?: (iceServers: RTCIceServer[]) => PairingPeer
    now?: () => number
    randomJitter?: () => number
}

export interface PairingTransportHandle {
    dispose(): void
    requestIceRestart(): void
    untilReady(): Promise<void>
    notifyForeground(): void
    subscribe(listener: () => void): () => void
    getSnapshot(): PairingTransportState
    getPeer(): PairingPeer
}
