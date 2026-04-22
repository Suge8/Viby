import { normalizeSessionActivityTimestamp } from '@viby/protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import {
    applySessionAttentionSnapshot,
    getNextSessionAttentionSeenSnapshot,
    readSessionAttentionSnapshot,
    type SessionAttentionSnapshot,
    seedSessionAttentionSnapshotForTests,
    subscribeSessionAttentionSnapshot,
} from '@/lib/sessionAttentionStore'
import type { SessionSummary } from '@/types/api'

export { seedSessionAttentionSnapshotForTests }

function getSessionActivityTimestamp(session: SessionSummary): number {
    return normalizeSessionActivityTimestamp(session.latestCompletedReplyAt) ?? 0
}

function isDocumentVisible(): boolean {
    if (typeof document === 'undefined') {
        return false
    }

    return document.visibilityState === 'visible'
}

export function useSessionAttention(
    sessions: readonly SessionSummary[],
    selectedSessionId: string | null
): {
    hasUnseenReply: (session: SessionSummary) => boolean
} {
    const [snapshot, setSnapshot] = useState<SessionAttentionSnapshot>(() => readSessionAttentionSnapshot())
    const snapshotRef = useRef(snapshot)
    snapshotRef.current = snapshot

    const activityAtBySessionId = useMemo(() => {
        return new Map(sessions.map((session) => [session.id, getSessionActivityTimestamp(session)]))
    }, [sessions])

    const commitSnapshot = useCallback(
        (updater: (current: SessionAttentionSnapshot) => SessionAttentionSnapshot): void => {
            const currentSnapshot = snapshotRef.current
            const nextSnapshot = updater(currentSnapshot)
            if (nextSnapshot === currentSnapshot) {
                return
            }

            snapshotRef.current = nextSnapshot
            setSnapshot(nextSnapshot)
            applySessionAttentionSnapshot(nextSnapshot)
        },
        []
    )

    useEffect(() => {
        if (sessions.length === 0) {
            return
        }

        commitSnapshot((currentSnapshot) => {
            const additions = sessions
                .filter((session) => currentSnapshot[session.id] === undefined)
                .map((session) => [session.id, getSessionActivityTimestamp(session)] as const)

            if (additions.length === 0) {
                return currentSnapshot
            }

            const nextSnapshot = {
                ...currentSnapshot,
                ...Object.fromEntries(additions),
            }
            return nextSnapshot
        })
    }, [commitSnapshot, sessions])

    const markSeen = useCallback(
        (sessionId: string, activityAt: number): void => {
            commitSnapshot((currentSnapshot) => {
                return getNextSessionAttentionSeenSnapshot(currentSnapshot, sessionId, activityAt)
            })
        },
        [commitSnapshot]
    )

    const syncSelectedSession = useCallback((): void => {
        if (!selectedSessionId || !isDocumentVisible()) {
            return
        }

        const activityAt = activityAtBySessionId.get(selectedSessionId)
        if (!activityAt) {
            return
        }

        markSeen(selectedSessionId, activityAt)
    }, [activityAtBySessionId, markSeen, selectedSessionId])

    useEffect(() => {
        syncSelectedSession()
    }, [syncSelectedSession])

    useEffect(() => {
        const unsubscribeForegroundPulse = subscribeForegroundPulse(() => {
            syncSelectedSession()
        })
        const unsubscribeSnapshot = subscribeSessionAttentionSnapshot(() => {
            const nextSnapshot = readSessionAttentionSnapshot()
            snapshotRef.current = nextSnapshot
            setSnapshot(nextSnapshot)
        })

        return () => {
            unsubscribeForegroundPulse()
            unsubscribeSnapshot()
        }
    }, [syncSelectedSession])

    const hasUnseenReply = useCallback(
        (session: SessionSummary): boolean => {
            if (session.id === selectedSessionId) {
                return false
            }

            const seenAt = snapshot[session.id]
            if (seenAt === undefined) {
                return false
            }

            const activityAt = getSessionActivityTimestamp(session)
            return activityAt > seenAt
        },
        [selectedSessionId, snapshot]
    )

    return {
        hasUnseenReply,
    }
}
