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
    isExpiredUnapprovedPairing,
    isStalePairingDeletionError,
    isStalePairingRefreshError,
} from '@/lib/hubControllerSupport'
import type { DesktopPairingSession, DesktopPairingSnapshot, PairingSessionSnapshot } from '@/types'

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
    refreshAll(): Promise<void>
    applySnapshot(snapshot: PairingSessionSnapshot & Partial<DesktopPairingSnapshot>): void
    clearPresence(pairingId: string): void
    deletePairing(pairingId: string): Promise<void>
    /**
     * Drop a pairing the broker has permanently rejected. Unlike `deletePairing`
     * this skips the broker DELETE call (the session is already gone there) and
     * only prunes the local row so the dead credential stops being handed to a
     * bridge.
     */
    dropRejectedPairing(pairingId: string): Promise<void>
    deleteAll(): Promise<void>
    cancelDraft(pairingId: string): Promise<void>
}

function indexByPairingId(sessions: readonly DesktopPairingSession[]): Map<string, DesktopPairingSession> {
    return new Map(sessions.map((session) => [session.pairing.id, session]))
}

function toDesktopPairingSnapshot(
    snapshot: PairingSessionSnapshot & Partial<DesktopPairingSnapshot>,
    fallback: DesktopPairingSnapshot
): DesktopPairingSnapshot {
    return { ...snapshot, remoteConnections: snapshot.remoteConnections ?? fallback.remoteConnections }
}

function toSortedArray(sessions: Map<string, DesktopPairingSession>): DesktopPairingSession[] {
    return [...sessions.values()].sort((a, b) => a.pairing.createdAt - b.pairing.createdAt)
}

export function clearRemoteConnectionPresence(session: DesktopPairingSession): DesktopPairingSession {
    let changed = false
    const remoteConnections = (session.pairing.remoteConnections ?? []).map((connection) => {
        if (connection.connectedAt === undefined) return connection
        changed = true
        const { connectedAt: _connectedAt, ...rest } = connection
        return rest
    })
    return changed ? { ...session, pairing: { ...session.pairing, remoteConnections } } : session
}

export async function resolveStoredDesktopPairings(options: {
    removePairing: (pairingId: string) => Promise<void>
    refreshPairing: (pairing: DesktopPairingSession) => Promise<DesktopPairingSession>
    sessions: readonly DesktopPairingSession[]
}): Promise<{ firstError: unknown | null; sessions: DesktopPairingSession[] }> {
    const resolved: DesktopPairingSession[] = []
    let firstError: unknown | null = null

    const checks = await Promise.all(
        options.sessions.map(async (session) => {
            if (isExpiredUnapprovedPairing(session)) {
                await options.removePairing(session.pairing.id).catch(() => undefined)
                return { error: null, session: null }
            }
            try {
                return { error: null, session: await options.refreshPairing(session) }
            } catch (error) {
                if (isStalePairingRefreshError(error)) {
                    await options.removePairing(session.pairing.id).catch(() => undefined)
                    return { error: null, session: null }
                }
                return { error, session: clearRemoteConnectionPresence(session) }
            }
        })
    )

    for (const check of checks) {
        if (check.error) firstError ??= check.error
        if (check.session) resolved.push(check.session)
    }

    return { firstError, sessions: resolved }
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
        (snapshot: PairingSessionSnapshot & Partial<DesktopPairingSnapshot>): void => {
            const existing = sessionsRef.current.get(snapshot.id)
            if (!existing) return
            const next = new Map(sessionsRef.current)
            next.set(snapshot.id, { ...existing, pairing: toDesktopPairingSnapshot(snapshot, existing.pairing) })
            replaceSessions(next)
        },
        [replaceSessions]
    )

    const clearPresence = useCallback(
        (pairingId: string): void => {
            const existing = sessionsRef.current.get(pairingId)
            if (!existing) return
            const cleared = clearRemoteConnectionPresence(existing)
            if (cleared === existing) return
            const next = new Map(sessionsRef.current)
            next.set(pairingId, cleared)
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
                const resolved = await resolveStoredDesktopPairings({
                    sessions: stored,
                    refreshPairing: refreshPairingSession,
                    removePairing: removePairingSession,
                })
                if (stopped) return
                replaceSessions(indexByPairingId(resolved.sessions))
                if (resolved.firstError) setActionError(describeDesktopError(resolved.firstError, '读取设备绑定失败。'))
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
                if (isExpiredUnapprovedPairing(next)) {
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

    const refreshAll = useCallback(async (): Promise<void> => {
        await Promise.all([...sessionsRef.current.keys()].map((pairingId) => refreshPairing(pairingId)))
    }, [refreshPairing])

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

    const dropRejectedPairing = useCallback(
        async (pairingId: string): Promise<void> => {
            if (!sessionsRef.current.has(pairingId)) return
            removePairing(pairingId)
            if (!tauriRuntimeAvailable) return
            await removePairingSession(pairingId).catch(() => undefined)
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
        refreshAll,
        applySnapshot,
        clearPresence,
        deletePairing,
        dropRejectedPairing,
        deleteAll,
        cancelDraft,
    }
}
