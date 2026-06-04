import type { PairingIceServer, PairingPeerHeartbeat, PairingPeerTerminalEventPayload } from '@viby/protocol'
import {
    createPairingPeerTextAssembler,
    createPairingTransport,
    createPairingTunnelRouteState,
    type PairingPeerTextSender,
    type PairingTransportHandle,
    type PairingTunnelRouteEvent,
    type PairingTunnelRouteState,
    shouldReprobePairingDirect,
    shouldRequestPairingDirectProbeAck,
} from '@viby/protocol/pairing'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { recordRemotePairingDiagnostic, recordRemoteRelayHeartbeatTimeoutDiagnostic } from './remotePairingDiagnostics'
import { createRemoteDirectHeartbeat, type RemoteDirectHeartbeatFailureReason } from './remotePairingDirectHeartbeat'
import { createRemotePairingCodedError, createRemoteRelayFatalError } from './remotePairingErrors'
import { createRemotePairingEventSeq } from './remotePairingEventSeq'
import { createRemotePeerPendingRequests } from './remotePairingPendingRequests'
import type { RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { readRemotePairingDirectCandidateEvent, readRemotePairingRouteStats } from './remotePairingRouteStats'
import type { RemotePeerRpcTelemetrySample } from './remotePairingStats'
import { attachRemotePeerDirectChannel } from './remotePeerDirectChannel'
import { createRemotePeerSessionBridgeAdapter } from './remotePeerSessionBridgeAdapter'
import { closeRemotePeerSessionResources, handleRemotePeerTransportFailure } from './remotePeerSessionLifecycle'
import { handleRemotePeerSessionMessage } from './remotePeerSessionMessage'
import { createRemotePeerReadyGate } from './remotePeerSessionReady'
import { createRemotePeerSessionRelay } from './remotePeerSessionRelay'
import { commitRemotePeerSessionRoute, readRemotePeerTransportFatalError } from './remotePeerSessionRouteCommit'
import { readRemotePeerSessionSnapshot } from './remotePeerSessionState'
import { startRemotePeerReadyTimeout } from './remotePeerSessionTimeout'
import {
    createRemotePeerSessionTrace,
    installRemotePeerSessionTraceExporter,
    recordRemoteDirectCandidateSampleFailure,
} from './remotePeerSessionTrace'

export interface RemotePeerSession extends RemotePeerBridge {}
export class RemotePeerSession {
    private readonly transport: PairingTransportHandle
    private readonly trace: ReturnType<typeof createRemotePeerSessionTrace>
    private readonly pendingRequests = createRemotePeerPendingRequests({
        onTransportFailure: (_error, route) => this.handleTransportFailure(route),
        onTelemetry: (sample) => {
            this.lastRpcTelemetry = sample
            this.emitSnapshot()
        },
    })
    private readonly relay: RemotePairingRelaySocket
    private readonly textAssembler = createPairingPeerTextAssembler()
    private readonly heartbeat = createRemoteDirectHeartbeat({
        getChannel: () => this.channel,
        getLastSeenSeq: () => this.eventSeq.lastSeen(),
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
    private readonly eventSeq = createRemotePairingEventSeq()
    private readonly cancelReadyTimeout: () => void
    constructor(options: { pairingId: string; wsUrl: string; tunnelUrl: string; iceServers: PairingIceServer[] }) {
        this.trace = createRemotePeerSessionTrace(options.pairingId)
        installRemotePeerSessionTraceExporter(this.trace)
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
            onFatal: (reason) => this.fail(createRemoteRelayFatalError(reason)),
            onMessage: (data) => this.handlePeerMessage(data, 'relay'),
            onHeartbeatTimeout: () => this.handleRelayHeartbeatTimeout(),
            getLastSeenSeq: () => this.eventSeq.lastSeen(),
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
    getSnapshot() {
        return readRemotePeerSessionSnapshot(this.fatalError, this.routeState, this.transport)
    }
    async untilReady(): Promise<void> {
        await this.readyGate.wait(this.routeState.phase === 'ready', this.fatalError)
    }
    private createBridge(): RemotePeerBridge {
        return createRemotePeerSessionBridgeAdapter({
            pendingRequests: this.pendingRequests,
            getRouteState: () => this.routeState,
            getDirectChannelReady: () => this.directChannelReady,
            getChannel: () => this.channel,
            getDirectTextSender: () => this.directTextSender,
            getRelay: () => this.relay,
            getFatalError: () => this.fatalError,
            getTransportStats: async () => ({
                ...(await readRemotePairingRouteStats(this.routeState, this.transport)),
                lastRpc: this.lastRpcTelemetry,
            }),
            close: () => this.close(),
            syncListeners: this.syncListeners,
            terminalListeners: this.terminalListeners,
            closeListeners: this.closeListeners,
        })
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
        this.commitRoute({ type: 'direct-failed', reason: 'closed', routeGeneration: this.routeState.routeGeneration })
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
        if (this.routeState.phase === 'ready') this.commitRoute({ type: 'foreground-check' })
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
        void this.commitDirectCandidateSample().catch((error) => this.handleDirectCandidateSampleFailure(error))
        this.commitRoute({
            type: 'heartbeat-ack',
            route: 'direct',
            routeGeneration: this.routeState.routeGeneration,
            roundTripTimeMs,
            sampledAt: Date.now(),
        })
        if (shouldRequestPairingDirectProbeAck(this.routeState)) this.heartbeat.notifyForeground()
    }
    private handleDirectHeartbeatFailure(reason: RemoteDirectHeartbeatFailureReason): void {
        if (this.fatalError) return
        this.directChannelReady = false
        if (reason === 'heartbeat-missed') {
            this.commitRoute({
                type: 'heartbeat-missed',
                route: 'direct',
                routeGeneration: this.routeState.routeGeneration,
            })
        } else {
            this.commitRoute({ type: 'direct-failed', reason, routeGeneration: this.routeState.routeGeneration })
        }
        this.transport.requestIceRestart()
    }
    private handlePeerMessage(data: unknown, route: 'direct' | 'relay', channel?: RTCDataChannel): void {
        handleRemotePeerSessionMessage({
            data,
            route,
            channel,
            textAssembler: this.textAssembler,
            pendingRequests: this.pendingRequests,
            syncListeners: this.syncListeners,
            terminalListeners: this.terminalListeners,
            acceptEventSeq: this.eventSeq.accept,
            fail: (error) => this.fail(error),
            handleDirectAck: (channel, heartbeat) => this.handleHeartbeatAck(channel, heartbeat),
            maybeReprobeDirect: () => this.maybeReprobeDirect(),
            relay: this.relay,
            relayHeartbeat: this.relayHeartbeat,
            commitRelayAck: (roundTripTimeMs, sampledAt) =>
                this.commitRoute({ type: 'heartbeat-ack', route: 'relay', roundTripTimeMs, sampledAt }),
        })
    }
    private async commitDirectCandidateSample(): Promise<void> {
        const event = await readRemotePairingDirectCandidateEvent(this.transport)
        if (!event) return
        if (event.type === 'direct-candidate-selected') {
            this.commitRoute({ ...event, routeGeneration: this.routeState.routeGeneration })
        }
        if (this.routeState.activeRoute !== 'direct') this.heartbeat.notifyForeground()
    }
    private handleDirectCandidateSampleFailure(error: unknown): void {
        recordRemoteDirectCandidateSampleFailure({ error, routeState: this.routeState, trace: this.trace })
    }
    private commitRoute(event: PairingTunnelRouteEvent): void {
        const result = commitRemotePeerSessionRoute({ event, routeState: this.routeState, trace: this.trace })
        this.routeState = result.next
        if (!result.changed) return
        if (this.routeState.phase === 'ready') this.markReady()
        else this.emitSnapshot()
    }
    private handleRelayHeartbeatTimeout(): void {
        const activeRoute = this.routeState.activeRoute
        this.commitRoute({ type: 'relay-lost' })
        this.relay.reconnect()
        recordRemoteRelayHeartbeatTimeoutDiagnostic(activeRoute, this.routeState.activeRoute)
    }
    private handleTransportFailure(route: 'direct' | 'relay' | null): void {
        this.routeState = handleRemotePeerTransportFailure({
            route,
            routeState: this.routeState,
            emitSnapshot: () => this.emitSnapshot(),
            pendingRequests: this.pendingRequests,
            relay: this.relay,
            requestIceRestart: () => this.transport.requestIceRestart(),
        })
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
        const error = readRemotePeerTransportFatalError(this.transport.getSnapshot(), this.fatalError)
        if (error) this.fail(error)
    }
    close(): void {
        const directTextSender = this.directTextSender
        const channel = this.channel
        this.directChannelReady = false
        this.directTextSender = null
        this.channel = null
        closeRemotePeerSessionResources({
            cancelReadyTimeout: this.cancelReadyTimeout,
            unsubscribeForeground: this.unsubscribeForeground,
            unsubscribeTransport: this.unsubscribeTransport,
            relay: this.relay,
            relayHeartbeat: this.relayHeartbeat,
            directTextSender,
            heartbeat: this.heartbeat,
            readyGate: this.readyGate,
            pendingRequests: this.pendingRequests,
            closeListeners: this.closeListeners,
            snapshotListeners: this.snapshotListeners,
            channel,
            transport: this.transport,
        })
    }
}
