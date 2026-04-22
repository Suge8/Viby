import type { PairingParticipantRecord, PairingRole, PairingSessionRecord } from '@viby/protocol/pairing'
import type { PairingReconnectChallengeRecord } from './storeTypes'

export interface PairingTokenIndex {
    pairingId: string
    role: PairingRole
}

export function cloneSession(session: PairingSessionRecord): PairingSessionRecord {
    return structuredClone(session)
}

export function sessionKey(pairingId: string): string {
    return `pairing:session:${pairingId}`
}

export function tokenIndexKey(tokenHash: string): string {
    return `pairing:token:${tokenHash}`
}

export function reconnectChallengeKey(pairingId: string, role: PairingRole): string {
    return `pairing:challenge:${pairingId}:${role}`
}

export function encodeTokenIndex(index: PairingTokenIndex): string {
    return JSON.stringify(index)
}

export function decodeTokenIndex(raw: string): PairingTokenIndex | null {
    try {
        const parsed = JSON.parse(raw) as Partial<PairingTokenIndex>
        if (typeof parsed.pairingId !== 'string') {
            return null
        }

        if (parsed.role !== 'host' && parsed.role !== 'guest') {
            return null
        }

        return { pairingId: parsed.pairingId, role: parsed.role }
    } catch {
        return null
    }
}

export function cloneReconnectChallenge(challenge: PairingReconnectChallengeRecord): PairingReconnectChallengeRecord {
    return { ...challenge }
}

export function encodeReconnectChallenge(challenge: PairingReconnectChallengeRecord): string {
    return JSON.stringify(challenge)
}

export function decodeReconnectChallenge(raw: string): PairingReconnectChallengeRecord | null {
    try {
        const parsed = JSON.parse(raw) as Partial<PairingReconnectChallengeRecord>
        const issuedAt = parsed.issuedAt
        const expiresAt = parsed.expiresAt
        if (typeof parsed.nonce !== 'string' || parsed.nonce.length === 0) {
            return null
        }
        if (
            !Number.isInteger(issuedAt) ||
            !Number.isInteger(expiresAt) ||
            (issuedAt ?? 0) <= 0 ||
            (expiresAt ?? 0) <= 0
        ) {
            return null
        }

        return {
            nonce: parsed.nonce,
            issuedAt: Number(issuedAt),
            expiresAt: Number(expiresAt),
        }
    } catch {
        return null
    }
}

export function isActiveState(state: PairingSessionRecord['state']): boolean {
    return state === 'waiting' || state === 'claimed' || state === 'connected'
}

export function isApprovedSession(session: PairingSessionRecord): boolean {
    return session.approvalStatus === 'approved'
}

export function deriveState(session: PairingSessionRecord): PairingSessionRecord['state'] {
    if (session.state === 'deleted' || session.state === 'expired') {
        return session.state
    }

    if (!session.guest) {
        return 'waiting'
    }

    return session.host.connectedAt && session.guest.connectedAt ? 'connected' : 'claimed'
}

export function clearTokenIndexes(session: PairingSessionRecord, tokenIndex: Map<string, PairingTokenIndex>): void {
    tokenIndex.delete(session.host.tokenHash)
    if (session.guest) {
        tokenIndex.delete(session.guest.tokenHash)
    }
}

export function expireIfNeeded(
    session: PairingSessionRecord,
    now: number,
    tokenIndex: Map<string, PairingTokenIndex>
): PairingSessionRecord {
    if (isActiveState(session.state) && now >= session.expiresAt) {
        clearTokenIndexes(session, tokenIndex)
        return {
            ...session,
            state: 'expired',
            updatedAt: now,
            shortCode: session.shortCode,
            approvalStatus: session.approvalStatus,
            host: { ...session.host, connectedAt: undefined },
            guest: session.guest ? { ...session.guest, connectedAt: undefined } : null,
        }
    }

    return session
}

export function updateParticipant(
    session: PairingSessionRecord,
    role: PairingRole,
    patch: Partial<Pick<PairingParticipantRecord, 'connectedAt' | 'lastSeenAt'>>
): PairingSessionRecord {
    if (role === 'host') {
        return {
            ...session,
            host: { ...session.host, ...patch },
        }
    }

    if (!session.guest) {
        return session
    }

    return {
        ...session,
        guest: { ...session.guest, ...patch },
    }
}

export function updateState(session: PairingSessionRecord): PairingSessionRecord {
    return {
        ...session,
        state: deriveState(session),
    }
}
