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

function isHubRuntimeReady(status: HubRuntimeStatus | undefined): status is HubRuntimeStatus {
    return status?.phase === 'ready'
}

function buildHubRuntimeKey(status: HubRuntimeStatus | undefined): string {
    return isHubRuntimeReady(status) ? `${status.localHubUrl}|${status.cliApiToken}` : 'idle'
}

function buildPairingsKey(pairings: readonly DesktopPairingSession[]): string {
    return pairings.map((session) => `${session.pairing.id}:${session.wsUrl}`).join('|')
}

export function usePairingBridges(options: {
    pairings: readonly DesktopPairingSession[]
    status: HubRuntimeStatus | undefined
    enabled: boolean
}): Map<string, PairingBridgeState> {
    const [states, setStates] = useState<Map<string, PairingBridgeState>>(() => new Map())
    const activeRef = useRef<Map<string, () => void>>(new Map())

    const hubRuntimeKey = buildHubRuntimeKey(options.status)
    const pairingsKey = options.enabled ? buildPairingsKey(options.pairings) : 'disabled'
    const status = options.status
    const enabled = options.enabled
    const pairings = options.pairings

    useEffect(() => {
        const teardownAll = (): void => {
            activeRef.current.forEach((cleanup) => cleanup())
            activeRef.current.clear()
        }

        if (!enabled || !isHubRuntimeReady(status)) {
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
                status,
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
    }, [enabled, hubRuntimeKey, pairings, pairingsKey, status])

    useEffect(() => {
        return () => {
            activeRef.current.forEach((cleanup) => cleanup())
            activeRef.current.clear()
        }
    }, [])

    return states
}
