import type { PairingParticipantRecord, PairingRole, PairingSessionRecord } from '@viby/protocol/pairing'

export interface RedisPairingAdapter {
    ping(): Promise<void>
    get(key: string): Promise<string | null>
    set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void>
    del(key: string): Promise<void>
    compareAndSet(
        key: string,
        expected: string | null,
        next: string | null,
        options?: { ttlSeconds?: number }
    ): Promise<boolean>
}

export interface PairingReconnectChallengeRecord {
    nonce: string
    issuedAt: number
    expiresAt: number
}

export interface PairingHandoffTicketRecord {
    expiresAt: number
    tokenHash: string
}

export interface PairingStore {
    healthCheck(): Promise<void>
    createSession(session: PairingSessionRecord): Promise<PairingSessionRecord>
    getSession(pairingId: string): Promise<PairingSessionRecord | null>
    getSessionByTokenHash(tokenHash: string): Promise<{ session: PairingSessionRecord; role: PairingRole } | null>
    /**
     * Atomic verify-code + claim + approve: the only path that promotes a
     * guest to "approved". Returns the updated record on success; returns
     * null when the session is missing, inactive, the provided code does not
     * match the stored `shortCode`, or another guest already claimed the
     * session in a race. The caller must rate-limit and pre-screen
     * not-found / expired states to choose the correct user-facing error.
     */
    claimAndApprove(
        pairingId: string,
        providedCode: string,
        guest: PairingParticipantRecord,
        at: number
    ): Promise<PairingSessionRecord | null>
    renewSession(pairingId: string, expiresAt: number, at: number): Promise<PairingSessionRecord | null>
    bindGuestDeviceKey(pairingId: string, publicKey: string, at: number): Promise<PairingSessionRecord | null>
    rotateGuestToken(
        pairingId: string,
        guest: PairingParticipantRecord,
        at: number
    ): Promise<PairingSessionRecord | null>
    issueReconnectChallenge(
        pairingId: string,
        role: PairingRole,
        challenge: PairingReconnectChallengeRecord
    ): Promise<PairingReconnectChallengeRecord>
    consumeReconnectChallenge(pairingId: string, role: PairingRole, nonce: string, at: number): Promise<boolean>
    issueHandoffTicket(pairingId: string, ticket: PairingHandoffTicketRecord): Promise<PairingHandoffTicketRecord>
    consumeHandoffTicket(pairingId: string, tokenHash: string, at: number): Promise<boolean>
    deleteSession(pairingId: string, at: number): Promise<PairingSessionRecord | null>
}

export interface PairingStoreLease {
    store: PairingStore
    dispose(): Promise<void>
}
