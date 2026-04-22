import type { PairingParticipantRecord, PairingRole, PairingSessionRecord } from '@viby/protocol/pairing'

export interface RedisPairingAdapter {
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

export interface PairingStore {
    createSession(session: PairingSessionRecord): Promise<PairingSessionRecord>
    getSession(pairingId: string): Promise<PairingSessionRecord | null>
    getSessionByTokenHash(tokenHash: string): Promise<{ session: PairingSessionRecord; role: PairingRole } | null>
    claimSession(
        pairingId: string,
        guest: PairingParticipantRecord,
        shortCode: string
    ): Promise<PairingSessionRecord | null>
    approveSession(pairingId: string, at: number): Promise<PairingSessionRecord | null>
    markConnected(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null>
    touchConnection(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null>
    markDisconnected(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null>
    issueReconnectChallenge(
        pairingId: string,
        role: PairingRole,
        challenge: PairingReconnectChallengeRecord
    ): Promise<PairingReconnectChallengeRecord>
    consumeReconnectChallenge(pairingId: string, role: PairingRole, nonce: string, at: number): Promise<boolean>
    deleteSession(pairingId: string, at: number): Promise<PairingSessionRecord | null>
}

export interface PairingStoreLease {
    store: PairingStore
    dispose(): Promise<void>
}
