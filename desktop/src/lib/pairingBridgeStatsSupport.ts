import type { PairingBridgeState, PairingBridgeStats } from '@/types'
import { runPairingBridgeTask } from './pairingBridgeRuntimeSupport'
import { readPairingBridgeStats } from './pairingBridgeSupport'

const STATS_POLL_INTERVAL_MS = 10_000

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
    resetOfferState: () => void
    setBridgeState: BridgeStateSetter
    ensureOffer: (activePeer: RTCPeerConnection) => Promise<void>
    publishPairingTelemetry: (stats: PairingBridgeStats) => Promise<void>
    scheduleReconnect: (message: string) => void
    reportAsyncError: (message: string, error: unknown) => void
}) {
    let statsTimer: ReturnType<typeof setInterval> | null = null

    function stopStatsPolling(): void {
        if (statsTimer) {
            clearInterval(statsTimer)
        }
        statsTimer = null
    }

    async function samplePairingStats(activePeer: RTCPeerConnection): Promise<void> {
        const stats = await readPairingBridgeStats(activePeer, options.getRestartCount())
        const activeChannel = options.getChannel()
        options.setBridgeState({
            phase: activeChannel?.readyState === 'open' ? 'ready' : 'connecting',
            message: activeChannel?.readyState === 'open' ? '手机链路已接通。' : '正在建立点对点链路。',
            stats,
        })
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

        const restartCount = options.incrementRestartCount()
        options.resetOfferState()
        options.setBridgeState({
            phase: 'connecting',
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
