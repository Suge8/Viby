import { normalizeSessionActivityTimestamp } from '@viby/protocol'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import {
    readBrowserStorageJson,
    writeBrowserStorageJson
} from '@/lib/browserStorage'

const SESSION_ATTENTION_STORAGE_KEY = 'viby:session-attention'
const SESSION_ATTENTION_STORAGE = 'local' as const

type SessionAttentionSnapshot = Record<string, number>

function getSessionActivityTimestamp(session: SessionSummary): number {
    return normalizeSessionActivityTimestamp(session.latestCompletedReplyAt) ?? 0
}

function normalizeTimestamp(value: number | null | undefined): number {
    return normalizeSessionActivityTimestamp(value) ?? 0
}

function parseSessionAttentionSnapshot(rawValue: string): SessionAttentionSnapshot | null {
    try {
        const parsed = JSON.parse(rawValue) as unknown
        if (!parsed || typeof parsed !== 'object') {
            return null
        }

        return Object.fromEntries(
            Object.entries(parsed)
                .filter(([sessionId, timestamp]) => typeof sessionId === 'string' && typeof timestamp === 'number')
                .map(([sessionId, timestamp]) => [sessionId, normalizeTimestamp(timestamp)])
        )
    } catch {
        return null
    }
}

function readSessionAttentionSnapshot(): SessionAttentionSnapshot {
    return readBrowserStorageJson({
        storage: SESSION_ATTENTION_STORAGE,
        key: SESSION_ATTENTION_STORAGE_KEY,
        parse: parseSessionAttentionSnapshot
    }) ?? {}
}

function writeSessionAttentionSnapshot(snapshot: SessionAttentionSnapshot): void {
    writeBrowserStorageJson(SESSION_ATTENTION_STORAGE, SESSION_ATTENTION_STORAGE_KEY, snapshot)
}

function upsertSeenAt(
    snapshot: SessionAttentionSnapshot,
    sessionId: string,
    seenAt: number
): SessionAttentionSnapshot {
    const normalizedSeenAt = normalizeTimestamp(seenAt)
    if (normalizedSeenAt === 0) {
        return snapshot
    }

    const currentSeenAt = snapshot[sessionId] ?? 0
    if (normalizedSeenAt <= currentSeenAt) {
        return snapshot
    }

    return {
        ...snapshot,
        [sessionId]: normalizedSeenAt
    }
}

function isDocumentVisible(): boolean {
    if (typeof document === 'undefined') {
        return false
    }

    return document.visibilityState === 'visible'
}

export function useSessionAttention(
    sessions: SessionSummary[],
    selectedSessionId: string | null
): {
    hasUnseenReply: (session: SessionSummary) => boolean
} {
    const [snapshot, setSnapshot] = useState<SessionAttentionSnapshot>(() => readSessionAttentionSnapshot())

    const activityAtBySessionId = useMemo(() => {
        return new Map(sessions.map((session) => [session.id, getSessionActivityTimestamp(session)]))
    }, [sessions])

    useEffect(() => {
        if (sessions.length === 0) {
            return
        }

        setSnapshot((currentSnapshot) => {
            const additions = sessions
                .filter((session) => currentSnapshot[session.id] === undefined)
                .map((session) => [session.id, getSessionActivityTimestamp(session)] as const)

            if (additions.length === 0) {
                return currentSnapshot
            }

            const nextSnapshot = {
                ...currentSnapshot,
                ...Object.fromEntries(additions)
            }
            writeSessionAttentionSnapshot(nextSnapshot)
            return nextSnapshot
        })
    }, [sessions])

    const markSeen = useCallback((sessionId: string, activityAt: number): void => {
        setSnapshot((currentSnapshot) => {
            const nextSnapshot = upsertSeenAt(currentSnapshot, sessionId, activityAt)
            if (nextSnapshot === currentSnapshot) {
                return currentSnapshot
            }

            writeSessionAttentionSnapshot(nextSnapshot)
            return nextSnapshot
        })
    }, [])

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
        function handleVisibilityChange(): void {
            if (isDocumentVisible()) {
                syncSelectedSession()
            }
        }

        function handleStorage(event: StorageEvent): void {
            if (event.key !== SESSION_ATTENTION_STORAGE_KEY) {
                return
            }

            setSnapshot(readSessionAttentionSnapshot())
        }

        window.addEventListener('focus', syncSelectedSession)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('storage', handleStorage)

        return () => {
            window.removeEventListener('focus', syncSelectedSession)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('storage', handleStorage)
        }
    }, [syncSelectedSession])

    const hasUnseenReply = useCallback((session: SessionSummary): boolean => {
        if (session.id === selectedSessionId) {
            return false
        }

        const seenAt = snapshot[session.id]
        if (seenAt === undefined) {
            return false
        }

        const activityAt = getSessionActivityTimestamp(session)
        return activityAt > seenAt
    }, [selectedSessionId, snapshot])

    return useMemo(() => ({
        hasUnseenReply
    }), [hasUnseenReply])
}
