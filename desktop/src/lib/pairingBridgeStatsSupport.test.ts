import { describe, expect, it, mock } from 'bun:test'
import { createPairingBridgeStatsController } from './pairingBridgeStatsSupport'

function createStatsControllerHarness() {
    const setBridgeState = mock(() => undefined)
    const setBridgeStats = mock(() => undefined)
    const peer = {
        getStats: async () => new Map(),
        restartIce: mock(() => undefined),
    } as unknown as RTCPeerConnection

    const controller = createPairingBridgeStatsController({
        isDisposed: () => false,
        getChannel: () => ({ readyState: 'open' }) as RTCDataChannel,
        getPeer: () => peer,
        getSignalSocket: () => ({ readyState: WebSocket.OPEN }) as WebSocket,
        getRestartCount: () => 0,
        incrementRestartCount: () => 1,
        canRestartIce: () => true,
        resetOfferState: () => undefined,
        setBridgeState,
        setBridgeStats,
        ensureOffer: async () => undefined,
        publishPairingTelemetry: async () => undefined,
        scheduleReconnect: () => undefined,
        reportAsyncError: () => undefined,
    })

    return { controller, setBridgeState, setBridgeStats }
}

describe('pairingBridgeStatsSupport', () => {
    it('samples stats without owning the bridge lifecycle phase', async () => {
        const { controller, setBridgeState, setBridgeStats } = createStatsControllerHarness()

        controller.startStatsPolling({ getStats: async () => new Map() } as RTCPeerConnection)
        await new Promise((resolve) => setTimeout(resolve, 0))
        controller.stopStatsPolling()

        expect(setBridgeStats).toHaveBeenCalledWith({
            transport: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
            restartCount: 0,
            previousTransport: null,
        })
        expect(setBridgeState).not.toHaveBeenCalled()
    })

    it('keeps an open data channel in recovery presentation during ICE restart', () => {
        const { controller, setBridgeState } = createStatsControllerHarness()

        expect(controller.tryIceRestart('链路波动，正在执行 ICE 重启。')).toBe(true)

        expect(setBridgeState).toHaveBeenCalledWith({
            phase: 'paused',
            message: '链路波动，正在执行 ICE 重启。',
            stats: {
                transport: 'unknown',
                localCandidateType: null,
                remoteCandidateType: null,
                currentRoundTripTimeMs: null,
                restartCount: 1,
            },
        })
    })

    it('does not consume ICE restart throttle when signaling is unavailable', () => {
        const canRestartIce = mock(() => true)
        const controller = createPairingBridgeStatsController({
            isDisposed: () => false,
            getChannel: () => null,
            getPeer: () => ({ restartIce: mock(() => undefined) }) as unknown as RTCPeerConnection,
            getSignalSocket: () => null,
            getRestartCount: () => 0,
            incrementRestartCount: () => 1,
            canRestartIce,
            resetOfferState: () => undefined,
            setBridgeState: () => undefined,
            setBridgeStats: () => undefined,
            ensureOffer: async () => undefined,
            publishPairingTelemetry: async () => undefined,
            scheduleReconnect: () => undefined,
            reportAsyncError: () => undefined,
        })

        expect(controller.tryIceRestart('recover')).toBe(false)
        expect(canRestartIce).not.toHaveBeenCalled()
    })
})
