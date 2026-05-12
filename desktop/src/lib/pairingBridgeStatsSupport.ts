import { PAIRING_STATS_POLL_INTERVAL_MS } from '@viby/protocol/pairing'
import type { PairingBridgeState, PairingBridgeStats } from '@/types'
import { runPairingBridgeTask } from './pairingBridgeRuntimeSupport'
import { readPairingBridgeStats } from './pairingBridgeSupport'

const STATS_POLL_INTERVAL_MS = PAIRING_STATS_POLL_INTERVAL_MS
// How long we stay on relay before opportunistically restarting ICE to see
// whether a direct path has become available (e.g. cellular -> Wi-Fi handover
// where the OS routing table now allows host candidates again).
const RELAY_UPGRADE_PROBE_INTERVAL_MS = 30_000

type BridgeStateSetter = (
    state: Omit<PairingBridgeState, 'pairing'> & {
        stats?: PairingBridgeStats | null
    }
) => void

export function createPendingIceRestartStats(restartCount: number): PairingBridgeStats {
    return {
        transport: 'unknown',
        localCandidateType: null,
        remoteCandidateType: null,
        currentRoundTripTimeMs: null,
        restartCount,
    }
}

export function createPairingBridgeStatsController(options: {
    isDisposed: () => boolean
    getChannel: () => RTCDataChannel | null
    getPeer: () => RTCPeerConnection | null
    getSignalSocket: () => WebSocket | null
    getRestartCount: () => number
    incrementRestartCount: () => number
    canRestartIce: () => boolean
    resetOfferState: () => void
    setBridgeState: BridgeStateSetter
    setBridgeStats: (stats: PairingBridgeStats) => void
    ensureOffer: (activePeer: RTCPeerConnection) => Promise<void>
    publishPairingTelemetry: (stats: PairingBridgeStats) => Promise<void>
    scheduleReconnect: (message: string) => void
    reportAsyncError: (message: string, error: unknown) => void
}) {
    let statsTimer: ReturnType<typeof setInterval> | null = null
    let previousTransport: 'direct' | 'relay' | null = null
    let relayEnteredAt: number | null = null
    let lastUpgradeProbeAt = 0

    function stopStatsPolling(): void {
        if (statsTimer) {
            clearInterval(statsTimer)
        }
        statsTimer = null
    }

    function maybeProbeRelayUpgrade(activePeer: RTCPeerConnection, transport: PairingBridgeStats['transport']): void {
        const now = Date.now()
        if (transport === 'direct' || transport === 'unknown') {
            relayEnteredAt = transport === 'direct' ? null : relayEnteredAt
            return
        }
        // transport === 'relay': decide whether to probe for a direct path.
        if (relayEnteredAt === null) {
            relayEnteredAt = now
            return
        }
        if (now - relayEnteredAt < RELAY_UPGRADE_PROBE_INTERVAL_MS) return
        if (now - lastUpgradeProbeAt < RELAY_UPGRADE_PROBE_INTERVAL_MS) return
        if (!options.canRestartIce()) return
        lastUpgradeProbeAt = now
        relayEnteredAt = now
        // Opportunistic ICE restart: re-gather candidates without tearing down
        // the DataChannel. If the network now allows a host/srflx pair, ICE
        // will prefer it; otherwise we stay on relay with no user-visible
        // disruption beyond a brief "正在尝试升级” label.
        runPairingBridgeTask(
            async () => {
                activePeer.restartIce()
                await options.ensureOffer(activePeer)
            },
            {
                isDisposed: options.isDisposed,
                onError: (error) => options.reportAsyncError('点对点直连探测失败：', error),
            }
        )
    }

    async function samplePairingStats(activePeer: RTCPeerConnection): Promise<void> {
        const sample = await readPairingBridgeStats(activePeer, options.getRestartCount())
        const stats: PairingBridgeStats = { ...sample, previousTransport }
        if (sample.transport === 'direct' || sample.transport === 'relay') {
            previousTransport = sample.transport
        }
        options.setBridgeStats(stats)
        maybeProbeRelayUpgrade(activePeer, sample.transport)
        try {
            await options.publishPairingTelemetry(stats)
        } catch {}
    }

    function startStatsPolling(activePeer: RTCPeerConnection): void {
        stopStatsPolling()
        runPairingBridgeTask(() => samplePairingStats(activePeer), {
            isDisposed: options.isDisposed,
            onError: (error) => options.reportAsyncError('配对链路统计采样失败：', error),
        })
        statsTimer = setInterval(() => {
            runPairingBridgeTask(() => samplePairingStats(activePeer), {
                isDisposed: options.isDisposed,
                onError: (error) => options.reportAsyncError('配对链路统计采样失败：', error),
            })
        }, STATS_POLL_INTERVAL_MS)
    }

    function tryIceRestart(message: string): boolean {
        const activePeer = options.getPeer()
        const signalSocket = options.getSignalSocket()
        if (!activePeer || !signalSocket || signalSocket.readyState !== WebSocket.OPEN || options.isDisposed()) {
            return false
        }
        if (!options.canRestartIce()) {
            return false
        }

        const restartCount = options.incrementRestartCount()
        const recoveringLiveChannel = options.getChannel()?.readyState === 'open'
        options.resetOfferState()
        options.setBridgeState({
            phase: recoveringLiveChannel ? 'paused' : 'connecting',
            message,
            stats: createPendingIceRestartStats(restartCount),
        })

        runPairingBridgeTask(
            async () => {
                activePeer.restartIce()
                await options.ensureOffer(activePeer)
                await samplePairingStats(activePeer)
            },
            {
                isDisposed: options.isDisposed,
                onError: (error) => {
                    options.reportAsyncError('配对链路 ICE 重启失败：', error)
                    options.scheduleReconnect('ICE 重启失败，正在重建整条链路。')
                },
            }
        )

        return true
    }

    return {
        startStatsPolling,
        stopStatsPolling,
        tryIceRestart,
    }
}
