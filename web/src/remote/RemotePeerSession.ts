import type { PairingIceServer, PairingPeerHeartbeat, PairingPeerTerminalEventPayload } from '@viby/protocol'
import {
    createPairingPeerTextAssembler,
    createPairingTransport,
    type PairingPeerTextSender,
    type PairingTransportHandle,
    type PairingTunnelRouteEvent,
    shouldReprobePairingDirect,
    shouldRequestPairingDirectProbeAck,
} from '@viby/protocol/pairing'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { recordRemotePairingDiagnostic, recordRemoteRelayHeartbeatTimeoutDiagnostic } from './remotePairingDiagnostics'
import { createRemoteDirectHeartbeat, type RemoteDirectHeartbeatFailureReason } from './remotePairingDirectHeartbeat'
import { createRemoteRelayFatalError } from './remotePairingErrors'
import { createRemotePairingEventSeq } from './remotePairingEventSeq'
import { createRemotePeerPendingRequests } from './remotePairingPendingRequests'
import type { RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { readRemotePairingDirectCandidateEvent, readRemotePairingRouteStats } from './remotePairingRouteStats'
import type { RemotePeerRpcTelemetrySample } from './remotePairingStats'
import { attachRemotePeerDirectChannel } from './remotePeerDirectChannel'
import { createRemotePeerSessionBridgeAdapter } from './remotePeerSessionBridgeAdapter'
import { handleRemotePeerSessionMessage } from './remotePeerSessionMessage'
import { createRemotePeerReadyGate } from './remotePeerSessionReady'
import { createRemotePeerSessionRelay } from './remotePeerSessionRelay'
import { RemotePeerSessionRouteOwner } from './remotePeerSessionRouteOwner'
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
    private routeOwner!: RemotePeerSessionRouteOwner
    private channel: RTCDataChannel | null = null
    private directTextSender: PairingPeerTextSender | null = null
    private lastRpcTelemetry: RemotePeerRpcTelemetrySample | null = null
    private directChannelReady = false
    private readonly eventSeq = createRemotePairingEventSeq()
    private readonly cancelReadyTimeout: () => void
    constructor(options: { pairingId: string; wsUrl: string; tunnelUrl: string; iceServers: PairingIceServer[] }) {
        this.trace = createRemotePeerSessionTrace(options.pairingId)
        installRemotePeerSessionTraceExporter(this.trace)
        this.cancelReadyTimeout = startRemotePeerReadyTimeout(
            () => this.routeOwner.getRouteState().phase === 'ready',
            (error) => this.fail(error)
        )
        const relay = createRemotePeerSessionRelay({
            tunnelUrl: options.tunnelUrl,
            onOpen: () => {
                if (this.routeOwner.getRouteState().activeRoute !== 'direct') this.transport.requestIceRestart()
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
            this.routeOwner.handleTransportState()
            this.emitSnapshot()
        })
        this.unsubscribeForeground = subscribeForegroundPulse(() => this.handleForeground())
        this.routeOwner = new RemotePeerSessionRouteOwner({
            cancelReadyTimeout: this.cancelReadyTimeout,
            closeListeners: this.closeListeners,
            emitSnapshot: () => this.emitSnapshot(),
            heartbeat: this.heartbeat,
            pendingRequests: this.pendingRequests,
            readyGate: this.readyGate,
            relay: this.relay,
            relayHeartbeat: this.relayHeartbeat,
            requestIceRestart: () => this.transport.requestIceRestart(),
            snapshotListeners: this.snapshotListeners,
            trace: this.trace,
            transport: this.transport,
            unsubscribeForeground: this.unsubscribeForeground,
            unsubscribeTransport: this.unsubscribeTransport,
        })
        Object.assign(this, this.createBridge())
    }
    transportSubscribe(listener: () => void): () => void {
        this.snapshotListeners.add(listener)
        return () => this.snapshotListeners.delete(listener)
    }
    getSnapshot() {
        return readRemotePeerSessionSnapshot(
            this.routeOwner.getFatalError(),
            this.routeOwner.getRouteState(),
            this.transport
        )
    }
    async untilReady(): Promise<void> {
        await this.readyGate.wait(this.routeOwner.getRouteState().phase === 'ready', this.routeOwner.getFatalError())
    }
    private createBridge(): RemotePeerBridge {
        return createRemotePeerSessionBridgeAdapter({
            pendingRequests: this.pendingRequests,
            getRouteState: () => this.routeOwner.getRouteState(),
            getDirectChannelReady: () => this.directChannelReady,
            getChannel: () => this.channel,
            getDirectTextSender: () => this.directTextSender,
            getRelay: () => this.relay,
            getFatalError: () => this.routeOwner.getFatalError(),
            getTransportStats: async () => ({
                ...(await readRemotePairingRouteStats(this.routeOwner.getRouteState(), this.transport)),
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
        this.commitRoute({
            type: 'direct-failed',
            reason: 'closed',
            routeGeneration: this.routeOwner.getRouteState().routeGeneration,
        })
        this.heartbeat.stop()
        if (!this.routeOwner.getFatalError()) this.transport.requestIceRestart()
    }
    private emitSnapshot(): void {
        for (const listener of this.snapshotListeners) listener()
    }
    private handleForeground(): void {
        const routeState = this.routeOwner.getRouteState()
        recordRemotePairingDiagnostic('foreground', { route: routeState.activeRoute ?? 'none' })
        if (routeState.phase === 'ready') this.commitRoute({ type: 'foreground-check' })
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
            routeGeneration: this.routeOwner.getRouteState().routeGeneration,
            roundTripTimeMs,
            sampledAt: Date.now(),
        })
        if (shouldRequestPairingDirectProbeAck(this.routeOwner.getRouteState())) this.heartbeat.notifyForeground()
    }
    private handleDirectHeartbeatFailure(reason: RemoteDirectHeartbeatFailureReason): void {
        if (this.routeOwner.getFatalError()) return
        this.directChannelReady = false
        if (reason === 'heartbeat-missed') {
            this.commitRoute({
                type: 'heartbeat-missed',
                route: 'direct',
                routeGeneration: this.routeOwner.getRouteState().routeGeneration,
            })
        } else {
            this.commitRoute({
                type: 'direct-failed',
                reason,
                routeGeneration: this.routeOwner.getRouteState().routeGeneration,
            })
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
            this.commitRoute({ ...event, routeGeneration: this.routeOwner.getRouteState().routeGeneration })
        }
        if (this.routeOwner.getRouteState().activeRoute !== 'direct') this.heartbeat.notifyForeground()
    }
    private handleDirectCandidateSampleFailure(error: unknown): void {
        recordRemoteDirectCandidateSampleFailure({
            error,
            routeState: this.routeOwner.getRouteState(),
            trace: this.trace,
        })
    }
    private commitRoute(event: PairingTunnelRouteEvent): void {
        this.routeOwner.commit(event)
    }
    private handleRelayHeartbeatTimeout(): void {
        const activeRoute = this.routeOwner.getRouteState().activeRoute
        this.commitRoute({ type: 'relay-lost' })
        this.relay.reconnect()
        recordRemoteRelayHeartbeatTimeoutDiagnostic(activeRoute, this.routeOwner.getRouteState().activeRoute)
    }
    private handleTransportFailure(route: 'direct' | 'relay' | null): void {
        this.routeOwner.handleRpcFailure(route)
    }
    private maybeReprobeDirect(): void {
        if (!this.routeOwner.getFatalError() && shouldReprobePairingDirect(this.routeOwner.getRouteState())) {
            this.transport.requestIceRestart()
        }
    }
    private fail(error: Error): void {
        this.routeOwner.fail(error)
    }
    close(): void {
        const directTextSender = this.directTextSender
        const channel = this.channel
        this.directChannelReady = false
        this.directTextSender = null
        this.channel = null
        this.routeOwner.close({ directTextSender, channel })
    }
}
