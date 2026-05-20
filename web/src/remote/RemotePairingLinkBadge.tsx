import {
    classifyPairingLinkQuality,
    describePairingDirectBlockedReason,
    describePairingLinkTransport,
    formatPairingRoundTripTime,
} from '@viby/protocol/pairing'
import { type JSX, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'
import type { RemotePeerTransportStats } from './remotePairingStats'
import { type RemotePairingLinkBridge, useRemotePairingLinkStats } from './useRemotePairingLinkStats'

type RemotePairingLinkBadgeProps = {
    bridge: RemotePairingLinkBridge
}

function buildBadgeModel(stats: RemotePeerTransportStats | null): {
    label: string
    latency: string
    reason: string | null
    tone: 'success' | 'warning' | 'neutral'
} {
    if (!stats) return { label: '检测链路', latency: '测速中', reason: null, tone: 'neutral' }
    const quality = classifyPairingLinkQuality(stats)
    return {
        label: describePairingLinkTransport(stats),
        latency: formatPairingRoundTripTime(quality.roundTripTimeMs) ?? '测速中',
        reason: describePairingDirectBlockedReason(stats.directBlockedReason),
        tone: quality.tone,
    }
}

export function RemotePairingLinkBadge(props: RemotePairingLinkBadgeProps): JSX.Element | null {
    const stats = useRemotePairingLinkStats(props.bridge)
    const model = useMemo(() => buildBadgeModel(stats), [stats])
    const overlayRoot = ensureAppOverlayRoot()
    if (!overlayRoot) return null

    return createPortal(
        <div
            className={`remote-pairing-link-badge is-${model.tone}`}
            aria-label={model.reason ? `${model.label}，${model.latency}，${model.reason}` : undefined}
            aria-live="polite"
            title={model.reason ?? undefined}
        >
            <span className="remote-pairing-link-badge-dot" aria-hidden="true" />
            <span className="remote-pairing-link-badge-label">{model.label}</span>
            <span className="remote-pairing-link-badge-latency">{model.latency}</span>
        </div>,
        overlayRoot
    )
}
