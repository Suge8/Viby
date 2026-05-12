import { PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS } from '@viby/protocol'

type LivenessProbeOptions = {
    onStale: () => void
    timeoutMs?: number
    now?: () => number
}

export function createRemotePairingLivenessProbe(options: LivenessProbeOptions) {
    const timeoutMs = options.timeoutMs ?? PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS
    const now = options.now ?? Date.now
    let lastInboundAt = now()
    let probeTimer: number | null = null

    function clearProbeTimer(): void {
        if (probeTimer !== null) {
            window.clearTimeout(probeTimer)
            probeTimer = null
        }
    }

    function noteInbound(): void {
        lastInboundAt = now()
        clearProbeTimer()
    }

    function arm(): void {
        if (probeTimer !== null) return
        probeTimer = window.setTimeout(() => {
            probeTimer = null
            options.onStale()
        }, timeoutMs)
    }

    function getIdleMs(): number {
        return now() - lastInboundAt
    }

    function dispose(): void {
        clearProbeTimer()
    }

    return { noteInbound, arm, getIdleMs, dispose, getTimeoutMs: () => timeoutMs }
}

export type RemotePairingLivenessProbe = ReturnType<typeof createRemotePairingLivenessProbe>
