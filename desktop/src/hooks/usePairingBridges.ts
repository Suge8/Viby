import { useEffect, useRef, useState } from 'react'
import { startPairingBridge } from '@/lib/pairingBridgeController'
import type { DesktopPairingSession, HubRuntimeStatus, PairingBridgeState } from '@/types'

/**
 * Owns a live `PairingBridgeState` per persisted pairing.
 *
 * The desktop is a multi-tenant host: every paired mobile gets its own
 * bridge instance keyed by `pairingId`. Adding a fresh QR scan must never
 * disturb already-connected bridges, so this hook diffs the incoming
 * pairings map and only spins up new bridges / tears down the ones that
 * actually disappeared.
 *
 * The bridge spins up as soon as the invite exists rather than waiting on
 * the `approvalStatus === 'approved'` event. Broker WS / tunnel auth is
 * token-based (no approval gate), so the host can attach immediately and
 * sit idle until the guest verifies. This removes the SSE-delivery race
 * that left phones forever on the connecting splash.
 */
const IDLE_BRIDGE_STATE: PairingBridgeState = {
    phase: 'connecting',
    message: null,
    pairing: null,
    stats: null,
}

function getReadyStatus(status: HubRuntimeStatus | undefined): HubRuntimeStatus | null {
    return status?.phase === 'ready' ? status : null
}

function buildPairingsKey(pairings: readonly DesktopPairingSession[]): string {
    return pairings.map((session) => `${session.pairing.id}:${session.wsUrl}:${session.tunnelUrl}`).join('|')
}

export function buildPairingBridgeLifecycleKey(options: {
    enabled: boolean
    pairings: readonly DesktopPairingSession[]
}): string {
    return options.enabled ? buildPairingsKey(options.pairings) : 'disabled'
}

export function mergePairingSnapshotsIntoBridgeStates(
    states: Map<string, PairingBridgeState>,
    pairings: readonly DesktopPairingSession[]
): Map<string, PairingBridgeState> {
    const snapshots = new Map(pairings.map((session) => [session.pairing.id, session.pairing]))
    let changed = false
    const next = new Map<string, PairingBridgeState>()
    for (const [pairingId, state] of states) {
        const pairing = snapshots.get(pairingId)
        const merged = pairing && state.pairing !== pairing ? { ...state, pairing } : state
        changed ||= merged !== state
        next.set(pairingId, merged)
    }
    return changed ? next : states
}

export function usePairingBridges(options: {
    pairings: readonly DesktopPairingSession[]
    status: HubRuntimeStatus | undefined
    enabled: boolean
    onBridgeReady?: (pairingId: string) => void
    onBridgeRejected?: (pairingId: string, reason: string) => void
}): Map<string, PairingBridgeState> {
    const [states, setStates] = useState<Map<string, PairingBridgeState>>(() => new Map())
    const activeRef = useRef<Map<string, () => void>>(new Map())
    const readyNotifiedRef = useRef<Set<string>>(new Set())
    const statusRef = useRef<HubRuntimeStatus | undefined>(options.status)
    const onBridgeReadyRef = useRef(options.onBridgeReady)
    const onBridgeRejectedRef = useRef(options.onBridgeRejected)
    statusRef.current = options.status
    onBridgeReadyRef.current = options.onBridgeReady
    onBridgeRejectedRef.current = options.onBridgeRejected

    const pairingsKey = buildPairingBridgeLifecycleKey(options)
    const enabled = options.enabled
    const pairings = options.pairings

    useEffect(() => {
        const teardownAll = (): void => {
            activeRef.current.forEach((cleanup) => cleanup())
            activeRef.current.clear()
        }

        if (!enabled) {
            teardownAll()
            setStates(new Map())
            return
        }

        const live = activeRef.current
        const desired = new Map<string, DesktopPairingSession>(pairings.map((session) => [session.pairing.id, session]))

        // Tear down bridges whose pairing was removed.
        for (const [pairingId, cleanup] of live) {
            if (desired.has(pairingId)) continue
            cleanup()
            live.delete(pairingId)
            setStates((prev) => {
                if (!prev.has(pairingId)) return prev
                const next = new Map(prev)
                next.delete(pairingId)
                return next
            })
        }

        // Start bridges for newly added pairings.
        for (const [pairingId, pairing] of desired) {
            if (live.has(pairingId)) continue
            setStates((prev) => {
                if (prev.has(pairingId)) return prev
                const next = new Map(prev)
                next.set(pairingId, { ...IDLE_BRIDGE_STATE, pairing: pairing.pairing })
                return next
            })
            const cleanup = startPairingBridge({
                pairing,
                getStatus: () => getReadyStatus(statusRef.current),
                onStateChange: (state) => {
                    if (state.phase === 'ready' && !readyNotifiedRef.current.has(pairingId)) {
                        readyNotifiedRef.current.add(pairingId)
                        onBridgeReadyRef.current?.(pairingId)
                    } else if (state.phase !== 'ready') {
                        readyNotifiedRef.current.delete(pairingId)
                    }
                    setStates((prev) => {
                        const next = new Map(prev)
                        next.set(pairingId, state)
                        return next
                    })
                },
                onRejected: (reason) => onBridgeRejectedRef.current?.(pairingId, reason),
            })
            live.set(pairingId, cleanup)
        }
    }, [enabled, pairingsKey])

    useEffect(() => {
        setStates((prev) => mergePairingSnapshotsIntoBridgeStates(prev, pairings))
    }, [pairings])

    useEffect(() => {
        return () => {
            activeRef.current.forEach((cleanup) => cleanup())
            activeRef.current.clear()
        }
    }, [])

    return states
}
