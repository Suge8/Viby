import { runDetachedTask } from '@/utils/runDetachedTask'

const SESSION_DISCOVERY_FOLLOWER_ERROR = '[session-discovery] Scanner follower failed'
const SESSION_DISCOVERY_INITIAL_FOLLOWER_ERROR = '[session-discovery] Initial scanner follow-up failed'

export type SessionScannerFollower = {
    onNewSession: (sessionId: string) => void | Promise<void>
}

export type SessionDiscoveryCommit = (sessionId: string) => void
export type SessionDiscoveryBridge = {
    reportDiscoveredSessionId: (sessionId: string | null | undefined) => string | null
    attachScannerFollower: (follower: SessionScannerFollower | null) => void
}

function normalizeSessionId(sessionId: string | null | undefined): string | null {
    if (typeof sessionId !== 'string') {
        return null
    }

    const trimmed = sessionId.trim()
    return trimmed.length > 0 ? trimmed : null
}

function notifyScannerFollower(follower: SessionScannerFollower, sessionId: string, errorLabel: string): void {
    runDetachedTask(() => follower.onNewSession(sessionId), errorLabel)
}

export function reportDiscoveredSessionId(
    commitDiscoveredSessionId: SessionDiscoveryCommit,
    sessionId: string | null | undefined
): string | null {
    const normalized = normalizeSessionId(sessionId)
    if (!normalized) {
        return null
    }
    commitDiscoveredSessionId(normalized)
    return normalized
}

export function createSessionDiscoveryBridge(
    commitDiscoveredSessionId: SessionDiscoveryCommit
): SessionDiscoveryBridge {
    let lastSessionId: string | null = null
    let scannerFollower: SessionScannerFollower | null = null

    const reportDiscoveredSessionId = (sessionId: string | null | undefined): string | null => {
        const normalized = normalizeSessionId(sessionId)
        if (!normalized) {
            return null
        }

        if (normalized === lastSessionId) {
            return normalized
        }

        lastSessionId = normalized
        commitDiscoveredSessionId(normalized)
        const follower = scannerFollower
        if (follower) {
            notifyScannerFollower(follower, normalized, SESSION_DISCOVERY_FOLLOWER_ERROR)
        }
        return normalized
    }

    return {
        reportDiscoveredSessionId,
        attachScannerFollower(follower: SessionScannerFollower | null): void {
            scannerFollower = follower
            const sessionId = lastSessionId
            if (follower && sessionId) {
                notifyScannerFollower(follower, sessionId, SESSION_DISCOVERY_INITIAL_FOLLOWER_ERROR)
            }
        },
    }
}
