import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    clearPairingSessions,
    createPairingSession,
    deletePairingSession,
    getPairingSessions,
    isTauriRuntimeAvailable,
    refreshPairingSession,
    removePairingSession,
} from '@/lib/desktopApi'
import {
    DESKTOP_PREVIEW_MESSAGE,
    describeDesktopError,
    isExpiredUnclaimedPairing,
    isStalePairingDeletionError,
    isStalePairingRefreshError,
} from '@/lib/hubControllerSupport'
import type { DesktopPairingSession, PairingSessionSnapshot } from '@/types'

/**
 * Multi-pairing host state.
 *
 * The desktop is the host owner of every paired mobile. Each mobile is bound
 * to its own `pairingId` / `hostToken`; the previous single-pairing model
 * collapsed "add another device" into "rotate the only pairing", which is
 * exactly why scanning a fresh QR kicked off any already-connected phone.
 *
 * This hook is the single owner of the desktop pairings map. Bridge
 * orchestration, UI list rendering, and orphan cleanup all read from here.
 */
export interface DesktopPairingsApi {
    pairings: DesktopPairingSession[]
    pairingIds: ReadonlySet<string>
    /** Stable `pairing:<id>` set keyed for hub presence reconciliation. */
    pairingDeviceIds: ReadonlySet<string>
    resolved: boolean
    actionError: string | null
    busy: boolean
    createPairing(): Promise<DesktopPairingSession | null>
    refreshPairing(pairingId: string): Promise<void>
    applySnapshot(snapshot: PairingSessionSnapshot): void
    deletePairing(pairingId: string): Promise<void>
    deleteAll(): Promise<void>
    cancelDraft(pairingId: string): Promise<void>
}

function indexByPairingId(sessions: readonly DesktopPairingSession[]): Map<string, DesktopPairingSession> {
    return new Map(sessions.map((session) => [session.pairing.id, session]))
}

function toSortedArray(sessions: Map<string, DesktopPairingSession>): DesktopPairingSession[] {
    return [...sessions.values()].sort((a, b) => a.pairing.createdAt - b.pairing.createdAt)
}

export function useDesktopPairings(): DesktopPairingsApi {
    const tauriRuntimeAvailable = isTauriRuntimeAvailable()
    const [sessions, setSessions] = useState<Map<string, DesktopPairingSession>>(() => new Map())
    const [resolved, setResolved] = useState<boolean>(!tauriRuntimeAvailable)
    const [actionError, setActionError] = useState<string | null>(null)
    const [busy, setBusy] = useState<boolean>(false)
    const sessionsRef = useRef(sessions)
    sessionsRef.current = sessions

    const replaceSessions = useCallback((next: Map<string, DesktopPairingSession>): void => {
        sessionsRef.current = next
        setSessions(next)
    }, [])

    const upsertPairing = useCallback(
        (pairing: DesktopPairingSession): void => {
            const next = new Map(sessionsRef.current)
            next.set(pairing.pairing.id, pairing)
            replaceSessions(next)
        },
        [replaceSessions]
    )

    const removePairing = useCallback(
        (pairingId: string): void => {
            const next = new Map(sessionsRef.current)
            if (!next.delete(pairingId)) return
            replaceSessions(next)
        },
        [replaceSessions]
    )

    const applySnapshot = useCallback(
        (snapshot: PairingSessionSnapshot): void => {
            const existing = sessionsRef.current.get(snapshot.id)
            if (!existing) return
            const next = new Map(sessionsRef.current)
            next.set(snapshot.id, { ...existing, pairing: snapshot })
            replaceSessions(next)
        },
        [replaceSessions]
    )

    useEffect(() => {
        if (!tauriRuntimeAvailable) return
        let stopped = false

        async function loadPairings(): Promise<void> {
            try {
                const stored = await getPairingSessions()
                if (stopped) return
                const filtered: DesktopPairingSession[] = []
                for (const session of stored) {
                    if (isExpiredUnclaimedPairing(session)) {
                        await removePairingSession(session.pairing.id).catch(() => undefined)
                        continue
                    }
                    filtered.push(session)
                }
                if (stopped) return
                replaceSessions(indexByPairingId(filtered))
            } catch (error) {
                if (!stopped) setActionError(describeDesktopError(error, '读取设备绑定失败。'))
            } finally {
                if (!stopped) setResolved(true)
            }
        }

        void loadPairings()
        return () => {
            stopped = true
        }
    }, [replaceSessions, tauriRuntimeAvailable])

    const createPairing = useCallback(async (): Promise<DesktopPairingSession | null> => {
        if (!tauriRuntimeAvailable) {
            setActionError(DESKTOP_PREVIEW_MESSAGE)
            return null
        }
        setBusy(true)
        setActionError(null)
        try {
            const created = await createPairingSession()
            upsertPairing(created)
            return created
        } catch (error) {
            setActionError(describeDesktopError(error, '生成配对码失败。'))
            return null
        } finally {
            setBusy(false)
        }
    }, [tauriRuntimeAvailable, upsertPairing])

    const refreshPairing = useCallback(
        async (pairingId: string): Promise<void> => {
            if (!tauriRuntimeAvailable) return
            const target = sessionsRef.current.get(pairingId)
            if (!target) return
            try {
                const next = await refreshPairingSession(target)
                if (isExpiredUnclaimedPairing(next)) {
                    removePairing(pairingId)
                    await removePairingSession(pairingId).catch(() => undefined)
                    return
                }
                upsertPairing(next)
            } catch (error) {
                if (isStalePairingRefreshError(error)) {
                    removePairing(pairingId)
                    await removePairingSession(pairingId).catch(() => undefined)
                    return
                }
                setActionError(describeDesktopError(error, '刷新配对状态失败。'))
            }
        },
        [removePairing, tauriRuntimeAvailable, upsertPairing]
    )

    const deletePairing = useCallback(
        async (pairingId: string): Promise<void> => {
            if (!tauriRuntimeAvailable) {
                setActionError(DESKTOP_PREVIEW_MESSAGE)
                return
            }
            const target = sessionsRef.current.get(pairingId)
            if (!target) return
            setBusy(true)
            setActionError(null)
            try {
                try {
                    await deletePairingSession(target)
                } catch (error) {
                    if (!isStalePairingDeletionError(error)) throw error
                    // Broker session already gone; still drop the local row.
                    await removePairingSession(pairingId).catch(() => undefined)
                }
                removePairing(pairingId)
            } catch (error) {
                setActionError(describeDesktopError(error, '解除设备绑定失败。'))
            } finally {
                setBusy(false)
            }
        },
        [removePairing, tauriRuntimeAvailable]
    )

    const cancelDraft = useCallback(
        async (pairingId: string): Promise<void> => {
            if (!tauriRuntimeAvailable) return
            const target = sessionsRef.current.get(pairingId)
            if (!target) return
            if (target.pairing.approvalStatus === 'approved') return
            // Optimistic removal: drop the draft from the in-memory list
            // before awaiting the backend delete so any modal that opens on
            // the heels of `cancelDraft` cannot accidentally rebind to the
            // session being cancelled and flash open-then-closed.
            removePairing(pairingId)
            try {
                await deletePairingSession(target)
            } catch (error) {
                if (!isStalePairingDeletionError(error)) {
                    setActionError(describeDesktopError(error, '取消邀请失败。'))
                }
                await removePairingSession(pairingId).catch(() => undefined)
            }
        },
        [removePairing, tauriRuntimeAvailable]
    )

    const deleteAll = useCallback(async (): Promise<void> => {
        if (!tauriRuntimeAvailable) return
        try {
            await clearPairingSessions()
        } catch (error) {
            setActionError(describeDesktopError(error, '清理设备绑定失败。'))
        } finally {
            replaceSessions(new Map())
        }
    }, [replaceSessions, tauriRuntimeAvailable])

    const pairingIds = useMemo(() => new Set(sessions.keys()), [sessions])
    const pairingDeviceIds = useMemo(() => new Set([...sessions.keys()].map((id) => `pairing:${id}`)), [sessions])
    const pairingsArray = useMemo(() => toSortedArray(sessions), [sessions])

    return {
        pairings: pairingsArray,
        pairingIds,
        pairingDeviceIds,
        resolved,
        actionError,
        busy,
        createPairing,
        refreshPairing,
        applySnapshot,
        deletePairing,
        deleteAll,
        cancelDraft,
    }
}
