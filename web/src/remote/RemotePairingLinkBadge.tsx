import { classifyPairingLinkQuality, formatPairingRoundTripTime } from '@viby/protocol/pairing'
import { type JSX, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'
import { useTranslation } from '@/lib/use-translation'
import type { RemotePeerTransportStats } from './remotePairingStats'
import type { RemotePairingLinkBadgeOverride } from './remotePairingViewModel'
import { type RemotePairingLinkBridge, useRemotePairingLinkStats } from './useRemotePairingLinkStats'

type RemotePairingLinkBadgeProps = {
    bridge: RemotePairingLinkBridge
    override?: RemotePairingLinkBadgeOverride | null
}

const RPC_SAMPLE_STALE_MS = 30_000

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral'

type BadgeModel = {
    label: string
    latency: string
    tone: BadgeTone
}

function buildBadgeModel(
    stats: RemotePeerTransportStats | null,
    override: RemotePairingLinkBadgeOverride | null,
    t: TranslationFn
): BadgeModel {
    if (override) return override
    if (!stats) {
        return {
            label: t('remotePairing.linkBadge.detecting'),
            latency: t('remotePairing.linkBadge.measuring'),
            tone: 'neutral',
        }
    }
    const quality = classifyPairingLinkQuality(stats)
    return {
        label: describeBadgeTransport(stats, t),
        latency: formatPairingRoundTripTime(quality.roundTripTimeMs) ?? t('remotePairing.linkBadge.measuring'),
        tone: resolveBadgeTone(stats, quality.tone),
    }
}

function resolveBadgeTone(stats: RemotePeerTransportStats, transportTone: BadgeTone): BadgeTone {
    const sample = stats.lastRpc
    if (!sample || Date.now() - sample.sampledAt > RPC_SAMPLE_STALE_MS) return transportTone
    if (sample.timedOut) return 'danger'
    return !sample.ok || sample.durationMs > 2_000 ? 'warning' : transportTone
}

function describeBadgeTransport(stats: RemotePeerTransportStats, t: TranslationFn): string {
    switch (stats.transport) {
        case 'direct':
            return t('remotePairing.linkBadge.transport.direct')
        case 'relay':
            return t('remotePairing.linkBadge.transport.relay')
        default:
            return t('remotePairing.linkBadge.detecting')
    }
}

export function RemotePairingLinkBadge(props: RemotePairingLinkBadgeProps): JSX.Element | null {
    const { t } = useTranslation()
    const stats = useRemotePairingLinkStats(props.bridge)
    const model = useMemo(() => buildBadgeModel(stats, props.override ?? null, t), [stats, props.override, t])
    const overlayRoot = ensureAppOverlayRoot()
    if (!overlayRoot) return null

    return createPortal(
        <div
            className={`remote-pairing-link-badge is-${model.tone}`}
            aria-label={`${model.label}，${model.latency}`}
            aria-live="polite"
        >
            <span className="remote-pairing-link-badge-dot" aria-hidden="true" />
            <span className="remote-pairing-link-badge-label">{model.label}</span>
            <span className="remote-pairing-link-badge-latency">{model.latency}</span>
        </div>,
        overlayRoot
    )
}
