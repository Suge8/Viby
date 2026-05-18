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

function isApprovedPairing(session: DesktopPairingSession): boolean {
    return session.pairing.approvalStatus === 'approved'
}

function getBridgePairings(pairings: readonly DesktopPairingSession[]): DesktopPairingSession[] {
    return pairings.filter(isApprovedPairing)
}

function buildPairingsKey(pairings: readonly DesktopPairingSession[]): string {
    return getBridgePairings(pairings)
        .map((session) => `${session.pairing.id}:${session.wsUrl}:${session.tunnelUrl}`)
        .join('|')
}

export function buildPairingBridgeLifecycleKey(options: {
    enabled: boolean
    pairings: readonly DesktopPairingSession[]
}): string {
    return options.enabled ? buildPairingsKey(options.pairings) : 'disabled'
}

export function usePairingBridges(options: {
    pairings: readonly DesktopPairingSession[]
    status: HubRuntimeStatus | undefined
    enabled: boolean
}): Map<string, PairingBridgeState> {
    const [states, setStates] = useState<Map<string, PairingBridgeState>>(() => new Map())
    const activeRef = useRef<Map<string, () => void>>(new Map())
    const statusRef = useRef<HubRuntimeStatus | undefined>(options.status)
    statusRef.current = options.status

    const pairingsKey = buildPairingBridgeLifecycleKey(options)
    const enabled = options.enabled
    const pairings = getBridgePairings(options.pairings)

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
                    setStates((prev) => {
                        const next = new Map(prev)
                        next.set(pairingId, state)
                        return next
                    })
                },
            })
            live.set(pairingId, cleanup)
        }
    }, [enabled, pairingsKey])

    useEffect(() => {
        return () => {
            activeRef.current.forEach((cleanup) => cleanup())
            activeRef.current.clear()
        }
    }, [])

    return states
}
