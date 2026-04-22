import type { PairingTelemetrySample, PairingTelemetryTransport } from '@viby/protocol/pairing'

export type PairingMetricName =
    | 'create_requests'
    | 'create_rejected'
    | 'claim_requests'
    | 'claim_rejected'
    | 'challenge_requests'
    | 'challenge_rejected'
    | 'reconnect_requests'
    | 'reconnect_rejected'
    | 'approve_requests'
    | 'approve_rejected'
    | 'telemetry_reports'
    | 'telemetry_rejected'
    | 'delete_requests'
    | 'delete_rejected'
    | 'rate_limited'

type TelemetryAggregate = {
    totalReports: number
    transportCounts: Record<PairingTelemetryTransport, number>
    maxRestartCount: number
    lastSampledAt: number | null
    roundTripTimeMsTotal: number
    roundTripTimeMsSamples: number
}

export class PairingMetrics {
    private readonly counters = new Map<PairingMetricName, number>()
    private readonly telemetry: TelemetryAggregate = {
        totalReports: 0,
        transportCounts: {
            direct: 0,
            relay: 0,
            unknown: 0,
        },
        maxRestartCount: 0,
        lastSampledAt: null,
        roundTripTimeMsTotal: 0,
        roundTripTimeMsSamples: 0,
    }

    constructor(private readonly startedAt: number = Date.now()) {}

    increment(metric: PairingMetricName): void {
        this.counters.set(metric, (this.counters.get(metric) ?? 0) + 1)
    }

    recordTelemetry(sample: PairingTelemetrySample): void {
        this.telemetry.totalReports += 1
        this.telemetry.transportCounts[sample.transport] += 1
        this.telemetry.maxRestartCount = Math.max(this.telemetry.maxRestartCount, sample.restartCount)
        this.telemetry.lastSampledAt = sample.sampledAt
        if (typeof sample.currentRoundTripTimeMs === 'number') {
            this.telemetry.roundTripTimeMsTotal += sample.currentRoundTripTimeMs
            this.telemetry.roundTripTimeMsSamples += 1
        }
    }

    snapshot(now: number) {
        return {
            startedAt: this.startedAt,
            now,
            uptimeMs: Math.max(0, now - this.startedAt),
            counters: Object.fromEntries(this.counters.entries()),
            telemetry: {
                totalReports: this.telemetry.totalReports,
                transportCounts: this.telemetry.transportCounts,
                maxRestartCount: this.telemetry.maxRestartCount,
                lastSampledAt: this.telemetry.lastSampledAt,
                averageRoundTripTimeMs:
                    this.telemetry.roundTripTimeMsSamples > 0
                        ? Math.round(this.telemetry.roundTripTimeMsTotal / this.telemetry.roundTripTimeMsSamples)
                        : null,
            },
        }
    }
}
