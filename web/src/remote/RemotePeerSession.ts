import type { PairingIceServer, PairingPeerRequest, PairingPeerTerminalEventPayload } from '@viby/protocol'
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

export interface RemotePeerSession extends RemotePeerBridge {}

export class RemotePeerSession {
    private readonly transport: PairingTransportHandle
    private readonly pendingRequests = createRemotePeerPendingRequests({
        onTransportFailure: () => this.transport.requestIceRestart(),
    })
    private readonly syncListeners = new Set<(event: SyncEvent) => void>()
    private readonly terminalListeners = new Set<(event: PairingPeerTerminalEventPayload) => void>()
    private readonly closeListeners = new Set<(error: Error) => void>()
    private readonly unsubscribeForeground: () => void
    private readonly unsubscribeTransport: () => void
    private channel: RTCDataChannel | null = null
    private fatalError: Error | null = null

    constructor(options: { pairingId: string; wsUrl: string; iceServers: PairingIceServer[] }) {
        this.transport = createPairingTransport({
            pairingId: options.pairingId,
            polite: true,
            iceServers: options.iceServers,
            getWsUrl: async () => options.wsUrl,
            createDataChannel: false,
            onChannel: (channel) => this.attachChannel(channel as RTCDataChannel),
        })
        this.unsubscribeTransport = this.transport.subscribe(() => this.handleTransportState())
        this.unsubscribeForeground = subscribeForegroundPulse(() => this.transport.notifyForeground())
        Object.assign(this, this.createBridge())
    }

    transportSubscribe(listener: () => void): () => void {
        return this.transport.subscribe(listener)
    }

    getSnapshot(): PairingTransportState {
        return this.transport.getSnapshot()
    }

    untilReady(): Promise<void> {
        return this.transport.untilReady()
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
        this.channel = channel
        channel.addEventListener('message', (event) => {
            handleRemotePeerChannelMessage({
                data: event.data,
                pendingRequests: this.pendingRequests,
                syncListeners: this.syncListeners,
                terminalListeners: this.terminalListeners,
            })
        })
        channel.addEventListener('close', () => {
            if (!this.fatalError) this.transport.requestIceRestart()
        })
    }

    private handleTransportState(): void {
        const state = this.transport.getSnapshot()
        if (state.kind !== 'fatal' || this.fatalError) return
        const error =
            state.reason === 'closed'
                ? createRemotePairingCodedError('remotePairing.error.closedRetrying')
                : new RemotePeerConnectError('closed', mapByeToErrorKey(state.reason))
        this.fatalError = error
        this.pendingRequests.rejectAll(error)
        for (const listener of this.closeListeners) listener(error)
    }

    close(): void {
        this.unsubscribeForeground()
        this.unsubscribeTransport()
        this.pendingRequests.rejectAll(createRemotePairingCodedError('remotePairing.error.closedRetrying'))
        this.closeListeners.clear()
        this.channel?.close()
        this.transport.dispose()
    }
}
