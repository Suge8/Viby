import { PAIRING_TELEMETRY_REPORT_INTERVAL_MS } from '@viby/protocol/pairing'
import type { DesktopPairingSession, PairingBridgeStats } from '@/types'
import { postPairingTelemetry } from './pairingBridgeTransportSupport'

const TELEMETRY_REPORT_INTERVAL_MS = PAIRING_TELEMETRY_REPORT_INTERVAL_MS

export function createPairingTelemetryPublisher(pairing: DesktopPairingSession) {
    let lastTelemetrySignature: string | null = null
    let lastTelemetryAt = 0

    return async (stats: PairingBridgeStats): Promise<void> => {
        const now = Date.now()
        const roundedRoundTrip =
            typeof stats.currentRoundTripTimeMs === 'number' ? Math.round(stats.currentRoundTripTimeMs / 10) * 10 : -1
        const signature = [
            stats.transport,
            stats.localCandidateType ?? 'null',
            stats.remoteCandidateType ?? 'null',
            roundedRoundTrip,
            stats.restartCount,
        ].join(':')
        if (signature === lastTelemetrySignature && now - lastTelemetryAt < TELEMETRY_REPORT_INTERVAL_MS) {
            return
        }

        await postPairingTelemetry(pairing, stats, now)
        lastTelemetrySignature = signature
        lastTelemetryAt = now
    }
}
