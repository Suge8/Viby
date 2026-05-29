import {
    isProtocolVersionCompatible,
    type PairingIceServer,
    type PairingPeerHeartbeat,
    type PairingPeerRequest,
    type PairingPeerTerminalEventPayload,
    resolvePeerProtocolVersion,
} from '@viby/protocol'
import {
    createPairingPeerTextAssembler,
    createPairingTransport,
    createPairingTunnelRouteState,
    type PairingPeerTextSender,
    type PairingTransportHandle,
    type PairingTransportState,
    type PairingTunnelRouteEvent,
    type PairingTunnelRouteState,
    reducePairingTunnelRoute,
    shouldReprobePairingDirect,
    shouldRequestPairingDirectProbeAck,
} from '@viby/protocol/pairing'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { handleRemotePeerChannelMessage } from './remotePairingChannelMessages'
import {
    recordRemotePairingDiagnostic,
    recordRemotePairingRouteDiagnostic,
    recordRemoteRelayHeartbeatTimeoutDiagnostic,
} from './remotePairingDiagnostics'
import { createRemoteDirectHeartbeat, type RemoteDirectHeartbeatFailureReason } from './remotePairingDirectHeartbeat'
import { createRemotePairingCodedError, mapByeToErrorKey, RemotePeerConnectError } from './remotePairingErrors'
import { createRemotePeerPendingRequests } from './remotePairingPendingRequests'
import type { RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { readRemotePairingDirectCandidateEvent, readRemotePairingRouteStats } from './remotePairingRouteStats'
import type { RemotePeerRpcTelemetrySample } from './remotePairingStats'
import { attachRemotePeerDirectChannel } from './remotePeerDirectChannel'
import { reduceRouteAfterPeerRpcFailure } from './remotePeerRouteFailure'
import { createRemotePeerSessionBridge } from './remotePeerSessionBridge'
import { createRemotePeerReadyGate } from './remotePeerSessionReady'
import { createRemotePeerSessionRelay } from './remotePeerSessionRelay'
import { createRemotePeerSessionSender } from './remotePeerSessionSender'
import { startRemotePeerReadyTimeout } from './remotePeerSessionTimeout'
export interface RemotePeerSession extends RemotePeerBridge {}
export class RemotePeerSession {
    private readonly transport: PairingTransportHandle
    private readonly pendingRequests = createRemotePeerPendingRequests({
        onTransportFailure: (_error, route) => this.handleTransportFailure(route),
        onTelemetry: (sample) => this.recordRpcTelemetry(sample),
    })
    private readonly relay: RemotePairingRelaySocket
    private readonly textAssembler = createPairingPeerTextAssembler()
    private readonly heartbeat = createRemoteDirectHeartbeat({
        getChannel: () => this.channel,
        onFailure: (reason) => this.handleDirectHeartbeatFailure(reason),
    })
    private readonly readyGate = createRemotePeerReadyGate()
    private readonly syncListeners = new Set<(event: SyncEvent) => void>()
    private readonly terminalListeners = new Set<(event: PairingPeerTerminalEventPayload) => void>()
    private readonly closeListeners = new Set<(error: Error) => void>()
    private readonly snapshotListeners = new Set<() => void>()
    private readonly unsubscribeForeground: () => void
    private readonly unsubscribeTransport: () => void
    private readonly relayHeartbeat: RemoteRelayHeartbeat
    private channel: RTCDataChannel | null = null
    private directTextSender: PairingPeerTextSender | null = null
    private lastRpcTelemetry: RemotePeerRpcTelemetrySample | null = null
    private routeState: PairingTunnelRouteState = createPairingTunnelRouteState()
    private fatalError: Error | null = null
    private directChannelReady = false
    private readonly cancelReadyTimeout: () => void
    constructor(options: { pairingId: string; wsUrl: string; tunnelUrl: string; iceServers: PairingIceServer[] }) {
        this.cancelReadyTimeout = startRemotePeerReadyTimeout(
            () => this.routeState.phase === 'ready',
            (error) => this.fail(error)
        )
        const relay = createRemotePeerSessionRelay({
            tunnelUrl: options.tunnelUrl,
            onOpen: () => {
                if (this.routeState.activeRoute !== 'direct') this.transport.requestIceRestart()
            },
            onClose: () => this.commitRoute({ type: 'relay-lost' }),
            onFatal: () => this.fail(new RemotePeerConnectError('closed', 'remotePairing.error.scanAgain')),
            onMessage: (data) => this.handlePeerMessage(data, 'relay'),
            onHeartbeatTimeout: () => this.handleRelayHeartbeatTimeout(),
        })
        this.relay = relay.relay
        this.relayHeartbeat = relay.heartbeat
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
        if (this.fatalError) return { kind: 'fatal', reason: 'closed' }
        if (this.routeState.phase === 'ready') return { kind: 'ready' }
        const state = this.transport.getSnapshot()
        return state.kind === 'fatal' ? state : { kind: 'connecting', attempt: 0 }
    }
    async untilReady(): Promise<void> {
        await this.readyGate.wait(this.routeState.phase === 'ready', this.fatalError)
    }
    private createBridge(): RemotePeerBridge {
        return createRemotePeerSessionBridge({
            requestPeer: (request, parse) => this.request(request, parse),
            close: () => this.close(),
            getTransportStats: async () => ({
                ...(await readRemotePairingRouteStats(this.routeState, this.transport)),
                lastRpc: this.lastRpcTelemetry,
            }),
            getChannel: () => this.channel,
            getRelay: () => this.relay,
            getFatalError: () => this.fatalError,
            syncListeners: this.syncListeners,
            terminalListeners: this.terminalListeners,
            closeListeners: this.closeListeners,
        })
    }
    private request<T>(request: PairingPeerRequest, parse: (value: unknown) => T): Promise<T> {
        return this.pendingRequests.request(
            createRemotePeerSessionSender({
                routeState: this.routeState,
                directChannelReady: this.directChannelReady,
                channel: this.channel,
                directTextSender: this.directTextSender,
                relay: this.relay,
            }),
            request,
            parse
        )
    }
    private attachChannel(channel: RTCDataChannel): void {
        const previousChannel = this.channel
        this.directChannelReady = false
        this.commitRoute({ type: 'direct-probe-started' })
        this.heartbeat.stop()
        this.directTextSender?.close()
        this.channel = channel
        this.directTextSender = attachRemotePeerDirectChannel({
            channel,
            previousChannel,
            isCurrentChannel: (target) => this.channel === target,
            onOpen: (target) => this.heartbeat.start(target),
            onMessage: (data, target) => this.handlePeerMessage(data, 'direct', target),
            onClose: () => this.handleDirectChannelClose(),
        })
    }
    private handleDirectChannelClose(): void {
        this.channel = null
        this.directChannelReady = false
        this.directTextSender?.close()
        this.directTextSender = null
        this.commitRoute({ type: 'direct-failed', reason: 'closed' })
        this.heartbeat.stop()
        if (!this.fatalError) this.transport.requestIceRestart()
    }
    private emitSnapshot(): void {
        for (const listener of this.snapshotListeners) listener()
    }
    private markReady(): void {
        this.cancelReadyTimeout()
        this.readyGate.resolve()
        this.emitSnapshot()
    }
    private handleForeground(): void {
        recordRemotePairingDiagnostic('foreground', { route: this.routeState.activeRoute ?? 'none' })
        this.relay.notifyForeground()
        this.relayHeartbeat.notifyForeground()
        this.transport.notifyForeground()
        this.heartbeat.notifyForeground()
        this.maybeReprobeDirect()
    }
    private handleHeartbeatAck(channel: RTCDataChannel, heartbeat: PairingPeerHeartbeat): void {
        const roundTripTimeMs = this.heartbeat.markAck(channel, heartbeat)
        if (roundTripTimeMs === null) return
        this.directChannelReady = true
        void this.commitDirectCandidateSample().catch(() => undefined)
        this.commitRoute({ type: 'heartbeat-ack', route: 'direct', roundTripTimeMs, sampledAt: Date.now() })
        if (shouldRequestPairingDirectProbeAck(this.routeState)) this.heartbeat.notifyForeground()
    }
    private handleDirectHeartbeatFailure(reason: RemoteDirectHeartbeatFailureReason): void {
        if (this.fatalError) return
        this.directChannelReady = false
        if (reason === 'heartbeat-missed') this.commitRoute({ type: 'heartbeat-missed', route: 'direct' })
        else this.commitRoute({ type: 'direct-failed', reason })
        this.transport.requestIceRestart()
    }
    private handlePeerMessage(data: unknown, route: 'direct' | 'relay', channel?: RTCDataChannel): void {
        handleRemotePeerChannelMessage({
            data,
            textAssembler: this.textAssembler,
            pendingRequests: this.pendingRequests,
            syncListeners: this.syncListeners,
            terminalListeners: this.terminalListeners,
            onHeartbeat: (heartbeat) => this.handleRouteHeartbeat(route, heartbeat, channel),
        })
    }
    private handleRouteHeartbeat(
        route: 'direct' | 'relay',
        heartbeat: PairingPeerHeartbeat,
        channel?: RTCDataChannel
    ): void {
        if (!this.acceptPeerProtocol(heartbeat)) return
        if (!heartbeat.ack) {
            const payload = JSON.stringify({ ...heartbeat, ack: true })
            if (route === 'direct' && channel?.readyState === 'open') channel.send(payload)
            else if (route === 'relay' && this.relay.readyState === 'open') this.relay.send(payload)
            return
        }
        if (route === 'direct' && channel) return this.handleHeartbeatAck(channel, heartbeat)
        this.commitRoute({
            type: 'heartbeat-ack',
            route: 'relay',
            roundTripTimeMs: this.relayHeartbeat.markAck(),
            sampledAt: Date.now(),
        })
        this.maybeReprobeDirect()
    }
    private acceptPeerProtocol(heartbeat: PairingPeerHeartbeat): boolean {
        if (isProtocolVersionCompatible(resolvePeerProtocolVersion(heartbeat.protocolVersion))) return true
        this.fail(createRemotePairingCodedError('remotePairing.error.updateDesktop'))
        return false
    }
    private recordRpcTelemetry(sample: RemotePeerRpcTelemetrySample): void {
        this.lastRpcTelemetry = sample
        this.emitSnapshot()
    }
    private async commitDirectCandidateSample(): Promise<void> {
        const event = await readRemotePairingDirectCandidateEvent(this.transport)
        if (!event) return
        this.commitRoute(event)
        if (this.routeState.activeRoute !== 'direct') this.heartbeat.notifyForeground()
    }
    private commitRoute(event: PairingTunnelRouteEvent): void {
        const previous = this.routeState
        this.routeState = reducePairingTunnelRoute(this.routeState, event)
        if (this.routeState !== previous) {
            recordRemotePairingRouteDiagnostic({
                phase: this.routeState.phase,
                route: this.routeState.activeRoute,
                event: event.type,
            })
        }
        if (this.routeState !== previous && this.routeState.phase === 'ready') this.markReady()
        else if (this.routeState !== previous) this.emitSnapshot()
    }
    private handleRelayHeartbeatTimeout(): void {
        const activeRoute = this.routeState.activeRoute
        this.commitRoute({ type: 'relay-lost' })
        this.relay.notifyForeground()
        recordRemoteRelayHeartbeatTimeoutDiagnostic(activeRoute, this.routeState.activeRoute)
    }
    private handleTransportFailure(route: 'direct' | 'relay' | null): void {
        const failedRoute = route ?? this.routeState.activeRoute
        const error = createRemotePairingCodedError('remotePairing.error.peerRequestFailed')
        this.pendingRequests.rejectAll(error)
        this.routeState = reduceRouteAfterPeerRpcFailure(this.routeState, failedRoute)
        this.emitSnapshot()
        if (failedRoute === 'direct') this.transport.requestIceRestart()
        this.relay.notifyForeground()
        recordRemotePairingDiagnostic('rpc-failure', { route: failedRoute ?? 'none' })
    }
    private maybeReprobeDirect(): void {
        if (!this.fatalError && shouldReprobePairingDirect(this.routeState)) this.transport.requestIceRestart()
    }
    private fail(error: Error): void {
        if (this.fatalError) return
        this.cancelReadyTimeout()
        this.fatalError = error
        this.readyGate.reject(error)
        this.pendingRequests.rejectAll(error)
        for (const listener of this.closeListeners) listener(error)
        this.emitSnapshot()
    }
    private handleTransportState(): void {
        const state = this.transport.getSnapshot()
        if (state.kind !== 'fatal' || this.fatalError) return
        const error =
            state.reason === 'closed'
                ? createRemotePairingCodedError('remotePairing.error.closedRetrying')
                : new RemotePeerConnectError('closed', mapByeToErrorKey(state.reason))
        this.fail(error)
    }
    close(): void {
        this.cancelReadyTimeout()
        this.unsubscribeForeground()
        this.unsubscribeTransport()
        this.relay.dispose()
        this.relayHeartbeat.stop()
        const error = createRemotePairingCodedError('remotePairing.error.closedRetrying')
        this.directChannelReady = false
        this.directTextSender?.close(error)
        this.directTextSender = null
        this.heartbeat.stop()
        this.readyGate.reject(error)
        this.pendingRequests.rejectAll(error)
        this.closeListeners.clear()
        this.snapshotListeners.clear()
        const channel = this.channel
        this.channel = null
        channel?.close()
        this.transport.dispose()
    }
}
