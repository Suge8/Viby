import { PAIRING_TELEMETRY_REPORT_INTERVAL_MS, type PairingTelemetryRequest } from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingBridgeStats } from '@/types'

function buildTelemetryUrl(pairing: DesktopPairingSession): string {
    const url = new URL(pairing.wsUrl)
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
    url.pathname = `/pairings/${encodeURIComponent(pairing.pairing.id)}/telemetry`
    url.search = ''
    url.hash = ''
    return url.toString()
}

function buildTelemetryBody(stats: PairingBridgeStats): PairingTelemetryRequest {
    return {
        sample: {
            source: 'desktop',
            transport: stats.transport,
            transportMode: stats.transportMode,
            localCandidateType: stats.localCandidateType,
            remoteCandidateType: stats.remoteCandidateType,
            currentRoundTripTimeMs: stats.currentRoundTripTimeMs,
            restartCount: stats.restartCount,
            routeRevision: stats.routeRevision,
            directBlockedReason: stats.directBlockedReason ?? null,
            sampledAt: stats.sampledAt,
        },
    }
}

export function startPairingBridgeTelemetry(options: {
    getStats: () => PairingBridgeStats | null
    pairing: DesktopPairingSession
    reportError: (message: string, error: unknown) => void
}): { dispose(): void; report(): Promise<void> } {
    const telemetryUrl = buildTelemetryUrl(options.pairing)
    let disposed = false
    let reportedFailure = false
    let timer: ReturnType<typeof setTimeout> | null = null
    schedule()

    return {
        dispose() {
            disposed = true
            if (timer) clearTimeout(timer)
            timer = null
        },
        report,
    }

    function schedule(): void {
        if (disposed) return
        timer = setTimeout(() => {
            void report().catch(reportFailure).finally(schedule)
        }, PAIRING_TELEMETRY_REPORT_INTERVAL_MS)
        if (typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') timer.unref()
    }

    async function report(): Promise<void> {
        const stats = options.getStats()
        if (disposed || !stats) return
        const response = await fetch(telemetryUrl, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${options.pairing.hostToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildTelemetryBody(stats)),
        })
        if (!response.ok) throw new Error(`telemetry ${response.status}`)
    }

    function reportFailure(error: unknown): void {
        if (disposed || reportedFailure) return
        reportedFailure = true
        options.reportError('配对链路遥测上报失败：', error)
    }
}
