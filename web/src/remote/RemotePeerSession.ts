import {
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingIceServer,
    type PairingPeerHeartbeat,
    type PairingPeerRequest,
    type PairingPeerTerminalEventPayload,
} from '@viby/protocol'
import { createPairingTransport, type PairingTransportHandle, type PairingTransportState } from '@viby/protocol/pairing'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import type { SyncEvent } from '@/types/api'
import { uploadRemoteFile } from './remotePairingBinaryUpload'
import { createRemotePeerBridge } from './remotePairingBridge'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { handleRemotePeerChannelMessage } from './remotePairingChannelMessages'
import { createRemotePairingCodedError, mapByeToErrorKey, RemotePeerConnectError } from './remotePairingErrors'
import { createRemotePeerPendingRequests } from './remotePairingPendingRequests'
import { readRemotePeerTransportStats } from './remotePairingStats'

const HEARTBEAT_STALE_TIMEOUT_GRACE_MS = PAIRING_PEER_HEARTBEAT_INTERVAL_MS

export interface RemotePeerSession extends RemotePeerBridge {}

export class RemotePeerSession {
    private readonly transport: PairingTransportHandle
    private readonly pendingRequests = createRemotePeerPendingRequests({
        onTransportFailure: () => this.transport.requestIceRestart(),
    })
    private readonly syncListeners = new Set<(event: SyncEvent) => void>()
    private readonly terminalListeners = new Set<(event: PairingPeerTerminalEventPayload) => void>()
    private readonly closeListeners = new Set<(error: Error) => void>()
    private readonly snapshotListeners = new Set<() => void>()
    private readonly unsubscribeForeground: () => void
    private readonly unsubscribeTransport: () => void
    private channel: RTCDataChannel | null = null
    private heartbeatIntervalId: number | null = null
    private heartbeatAckTimeoutId: number | null = null
    private fatalError: Error | null = null
    private channelReady = false
    private resolveChannelReady: (() => void) | null = null
    private rejectChannelReady: ((error: Error) => void) | null = null
    private channelReadyPromise: Promise<void> | null = null

    constructor(options: { pairingId: string; wsUrl: string; iceServers: PairingIceServer[] }) {
        this.transport = createPairingTransport({
            pairingId: options.pairingId,
            polite: true,
            iceServers: options.iceServers,
            getWsUrl: async () => options.wsUrl,
            createDataChannel: false,
            onChannel: (channel) => this.attachChannel(channel as RTCDataChannel),
        })
        this.unsubscribeTransport = this.transport.subscribe(() => {
            this.handleTransportState()
            this.emitSnapshot()
        })
        this.unsubscribeForeground = subscribeForegroundPulse(() => this.handleForeground())
        Object.assign(this, this.createBridge())
    }

    transportSubscribe(listener: () => void): () => void {
        this.snapshotListeners.add(listener)
        return () => this.snapshotListeners.delete(listener)
    }

    getSnapshot(): PairingTransportState {
        const state = this.transport.getSnapshot()
        return state.kind === 'ready' && !this.channelReady ? { kind: 'connecting', attempt: 0 } : state
    }

    async untilReady(): Promise<void> {
        await this.transport.untilReady()
        await this.waitChannelReady()
    }

    private createBridge(): RemotePeerBridge {
        return createRemotePeerBridge({
            requestPeer: (request, parse) => this.request(request, parse),
            subscribe: (listener) => {
                this.syncListeners.add(listener)
                return () => this.syncListeners.delete(listener)
            },
            subscribeTerminal: (listener) => {
                this.terminalListeners.add(listener)
                return () => this.terminalListeners.delete(listener)
            },
            onClose: (listener) => {
                if (this.fatalError) {
                    listener(this.fatalError)
                    return () => false
                }
                this.closeListeners.add(listener)
                return () => this.closeListeners.delete(listener)
            },
            close: () => this.close(),
            getTransportStats: () =>
                readRemotePeerTransportStats(this.transport.getPeer() as unknown as RTCPeerConnection),
            uploadFile: (sessionId, file, mimeType) =>
                uploadRemoteFile({
                    channel: this.channel,
                    requestPeer: (request, parse) => this.request(request, parse),
                    sessionId,
                    file,
                    mimeType,
                }),
        })
    }

    private request<T>(request: PairingPeerRequest, parse: (value: unknown) => T): Promise<T> {
        return this.pendingRequests.request(this.channel, request, parse)
    }

    private attachChannel(channel: RTCDataChannel): void {
        this.markChannelNotReady()
        this.stopHeartbeat()
        this.channel = channel
        channel.addEventListener('open', () => this.startHeartbeat(channel))
        channel.addEventListener('message', (event) => {
            handleRemotePeerChannelMessage({
                data: event.data,
                pendingRequests: this.pendingRequests,
                syncListeners: this.syncListeners,
                terminalListeners: this.terminalListeners,
                onHeartbeat: () => this.handleHeartbeatAck(channel),
            })
        })
        channel.addEventListener('close', () => {
            this.markChannelNotReady()
            this.stopHeartbeat()
            if (!this.fatalError) this.transport.requestIceRestart()
        })
        if (channel.readyState === 'open') this.startHeartbeat(channel)
    }

    private emitSnapshot(): void {
        for (const listener of this.snapshotListeners) listener()
    }

    private waitChannelReady(): Promise<void> {
        if (this.channelReady) return Promise.resolve()
        if (this.fatalError) return Promise.reject(this.fatalError)
        this.channelReadyPromise ??= new Promise<void>((resolve, reject) => {
            this.resolveChannelReady = resolve
            this.rejectChannelReady = reject
        })
        return this.channelReadyPromise
    }

    private markChannelNotReady(): void {
        if (this.channelReady) {
            this.channelReady = false
            this.channelReadyPromise = null
            this.resolveChannelReady = null
            this.rejectChannelReady = null
        }
        this.emitSnapshot()
    }

    private markChannelReady(channel: RTCDataChannel): void {
        if (this.channel !== channel || this.channelReady) return
        this.channelReady = true
        this.resolveChannelReady?.()
        this.channelReadyPromise = null
        this.resolveChannelReady = null
        this.rejectChannelReady = null
        this.emitSnapshot()
    }

    private handleForeground(): void {
        this.transport.notifyForeground()
        if (this.channel) this.sendHeartbeat(this.channel)
    }

    private startHeartbeat(channel: RTCDataChannel): void {
        this.stopHeartbeat()
        this.sendHeartbeat(channel)
        this.heartbeatIntervalId = window.setInterval(
            () => this.sendHeartbeat(channel),
            PAIRING_PEER_HEARTBEAT_INTERVAL_MS
        )
    }

    private sendHeartbeat(channel: RTCDataChannel): void {
        if (this.channel !== channel || channel.readyState !== 'open') return
        const heartbeat: PairingPeerHeartbeat = { kind: 'heartbeat' }
        try {
            channel.send(JSON.stringify(heartbeat))
            this.resetHeartbeatTimeout(channel)
        } catch {
            this.markChannelNotReady()
            this.transport.requestIceRestart()
        }
    }

    private resetHeartbeatTimeout(channel: RTCDataChannel): void {
        if (this.heartbeatAckTimeoutId !== null) window.clearTimeout(this.heartbeatAckTimeoutId)
        const deadline = Date.now() + PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS
        this.heartbeatAckTimeoutId = window.setTimeout(() => {
            this.heartbeatAckTimeoutId = null
            if (Date.now() - deadline > HEARTBEAT_STALE_TIMEOUT_GRACE_MS) return this.sendHeartbeat(channel)
            if (this.channel === channel && !this.fatalError) {
                this.markChannelNotReady()
                this.transport.requestIceRestart()
            }
        }, PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS)
    }

    private handleHeartbeatAck(channel: RTCDataChannel): void {
        if (this.channel !== channel) return
        if (this.heartbeatAckTimeoutId !== null) {
            window.clearTimeout(this.heartbeatAckTimeoutId)
            this.heartbeatAckTimeoutId = null
        }
        this.markChannelReady(channel)
    }

    private stopHeartbeat(): void {
        if (this.heartbeatIntervalId !== null) window.clearInterval(this.heartbeatIntervalId)
        if (this.heartbeatAckTimeoutId !== null) window.clearTimeout(this.heartbeatAckTimeoutId)
        this.heartbeatIntervalId = null
        this.heartbeatAckTimeoutId = null
    }

    private handleTransportState(): void {
        const state = this.transport.getSnapshot()
        if (state.kind !== 'fatal' || this.fatalError) return
        const error =
            state.reason === 'closed'
                ? createRemotePairingCodedError('remotePairing.error.closedRetrying')
                : new RemotePeerConnectError('closed', mapByeToErrorKey(state.reason))
        this.fatalError = error
        this.rejectChannelReady?.(error)
        this.channelReadyPromise = null
        this.resolveChannelReady = null
        this.rejectChannelReady = null
        this.pendingRequests.rejectAll(error)
        for (const listener of this.closeListeners) listener(error)
    }

    close(): void {
        this.unsubscribeForeground()
        this.unsubscribeTransport()
        this.markChannelNotReady()
        this.stopHeartbeat()
        const error = createRemotePairingCodedError('remotePairing.error.closedRetrying')
        this.rejectChannelReady?.(error)
        this.channelReadyPromise = null
        this.resolveChannelReady = null
        this.rejectChannelReady = null
        this.pendingRequests.rejectAll(error)
        this.closeListeners.clear()
        this.snapshotListeners.clear()
        this.channel?.close()
        this.transport.dispose()
    }
}
