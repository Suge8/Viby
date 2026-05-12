import type { PairingBridgeStats } from '@/types'

export function startPairingBridgeStats(options: {
    getPeer: () => RTCPeerConnection
    setStats: (stats: PairingBridgeStats | null) => void
    reportError: (message: string, error: unknown) => void
}): { dispose: () => void } {
    let timer: ReturnType<typeof setInterval> | null = setInterval(sample, 5_000)
    void sample()
    return {
        dispose: () => {
            if (timer) clearInterval(timer)
            timer = null
            options.setStats(null)
        },
    }

    async function sample(): Promise<void> {
        try {
            await options.getPeer().getStats()
            options.setStats({
                transport: 'unknown',
                previousTransport: null,
                localCandidateType: null,
                remoteCandidateType: null,
                currentRoundTripTimeMs: null,
                restartCount: 0,
            })
        } catch (error) {
            options.reportError('配对链路统计采集失败：', error)
        }
    }
}
