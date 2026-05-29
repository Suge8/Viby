import type { PairingParticipantRecord, PairingRole, PairingSessionRecord } from '@viby/protocol/pairing'
import type { PairingHandoffTicketRecord, PairingReconnectChallengeRecord } from './storeTypes'

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

export function handoffTicketKey(pairingId: string, tokenHash?: string): string {
    const baseKey = `pairing:handoff:${pairingId}`
    return tokenHash ? `${baseKey}:${tokenHash}` : baseKey
}

export function handoffTicketIndexKey(pairingId: string): string {
    return `pairing:handoff-index:${pairingId}`
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

export function cloneHandoffTicket(ticket: PairingHandoffTicketRecord): PairingHandoffTicketRecord {
    return { ...ticket }
}

export function encodeHandoffTicket(ticket: PairingHandoffTicketRecord): string {
    return JSON.stringify(ticket)
}

export function encodeHandoffTicketIndex(tokenHashes: readonly string[]): string {
    return JSON.stringify([...new Set(tokenHashes)])
}

export function decodeHandoffTicketIndex(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw) as unknown
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    } catch {
        return []
    }
}

export function decodeHandoffTicket(raw: string): PairingHandoffTicketRecord | null {
    try {
        const parsed = JSON.parse(raw) as Partial<PairingHandoffTicketRecord>
        if (typeof parsed.tokenHash !== 'string' || parsed.tokenHash.length === 0) return null
        if (!Number.isInteger(parsed.expiresAt) || (parsed.expiresAt ?? 0) <= 0) return null
        return { tokenHash: parsed.tokenHash, expiresAt: Number(parsed.expiresAt) }
    } catch {
        return null
    }
}

export function isActiveState(state: PairingSessionRecord['state']): boolean {
    return state === 'active' || state === 'waiting'
}

export function isApprovedSession(session: PairingSessionRecord): boolean {
    return session.approvalStatus === 'approved'
}

export function deriveState(session: PairingSessionRecord): PairingSessionRecord['state'] {
    return isActiveState(session.state) ? 'active' : session.state
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
