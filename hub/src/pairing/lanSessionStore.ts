import { randomBytes, randomUUID } from 'node:crypto'
import {
    type PairingHostEvent,
    type PairingSessionRecord,
    type PairingSessionSnapshot,
    toPairingSessionSnapshot,
} from '@viby/protocol/pairing'

const LAN_SESSION_TTL_MS = 5 * 60 * 1000
const SHORT_CODE_MAX = 1_000_000

function generateShortCode(): string {
    const value = randomBytes(4).readUInt32BE(0) % SHORT_CODE_MAX
    return value.toString().padStart(6, '0')
}

function generatePairingId(): string {
    return randomBytes(12).toString('base64url')
}

type LanPairingListener = (event: PairingHostEvent) => void

interface LanPairingListeners {
    listeners: Set<LanPairingListener>
}

export interface CreateLanPairingInput {
    label?: string
    metadata?: Record<string, unknown>
    ownerId: number
}

export interface VerifyLanPairingInput {
    pairingId: string
    code: string
    label?: string
    publicKey?: string
    metadata?: Record<string, unknown>
}

export interface VerifyLanPairingResult {
    status: 'ok' | 'not_found' | 'expired' | 'already_approved' | 'wrong_code'
    session?: PairingSessionRecord
}

export class LanPairingSessionStore {
    private readonly sessions = new Map<string, PairingSessionRecord>()
    private readonly listenerBuckets = new Map<string, LanPairingListeners>()
    private readonly ownerOfSession = new Map<string, number>()

    constructor(private readonly now: () => number = Date.now) {}

    create(input: CreateLanPairingInput): PairingSessionRecord {
        const id = generatePairingId()
        const issuedAt = this.now()
        const session: PairingSessionRecord = {
            id,
            state: 'waiting',
            createdAt: issuedAt,
            updatedAt: issuedAt,
            expiresAt: issuedAt + LAN_SESSION_TTL_MS,
            shortCode: generateShortCode(),
            approvalStatus: null,
            metadata: input.metadata,
            host: { tokenHash: `lan-host:${id}`, label: input.label, tokenHint: undefined, metadata: input.metadata },
            guest: null,
        }
        this.sessions.set(id, session)
        this.ownerOfSession.set(id, input.ownerId)
        return session
    }

    private expireIfNeeded(session: PairingSessionRecord): PairingSessionRecord {
        if ((session.state === 'active' || session.state === 'waiting') && this.now() >= session.expiresAt) {
            const expired: PairingSessionRecord = { ...session, state: 'expired', updatedAt: this.now() }
            this.sessions.set(session.id, expired)
            return expired
        }
        return session
    }

    getSnapshotForOwner(pairingId: string, ownerId: number): PairingSessionSnapshot | null {
        const session = this.sessions.get(pairingId)
        if (!session) return null
        if (this.ownerOfSession.get(pairingId) !== ownerId) return null
        return toPairingSessionSnapshot(this.expireIfNeeded(session))
    }

    isOwnedBy(pairingId: string, ownerId: number): boolean {
        return this.ownerOfSession.get(pairingId) === ownerId
    }

    verifyAndApprove(input: VerifyLanPairingInput): VerifyLanPairingResult {
        const session = this.sessions.get(input.pairingId)
        if (!session) return { status: 'not_found' }
        const live = this.expireIfNeeded(session)
        if (live.state === 'deleted' || live.state === 'expired') return { status: 'expired' }
        if (live.guest || live.approvalStatus === 'approved') return { status: 'already_approved' }
        if (live.shortCode === null || live.shortCode !== input.code) return { status: 'wrong_code' }

        const updatedAt = this.now()
        const approved: PairingSessionRecord = {
            ...live,
            updatedAt,
            approvalStatus: 'approved',
            guest: {
                tokenHash: `lan-guest:${live.id}:${randomUUID()}`,
                label: input.label,
                publicKey: input.publicKey,
                metadata: input.metadata,
                connectedAt: updatedAt,
                lastSeenAt: updatedAt,
            },
        }
        this.sessions.set(live.id, approved)
        this.emit(approved)
        return { status: 'ok', session: approved }
    }

    deleteForOwner(pairingId: string, ownerId: number): PairingSessionRecord | null {
        if (this.ownerOfSession.get(pairingId) !== ownerId) return null
        const session = this.sessions.get(pairingId)
        if (!session) return null
        const deleted: PairingSessionRecord = { ...session, state: 'deleted', updatedAt: this.now() }
        this.sessions.set(pairingId, deleted)
        this.emit(deleted)
        this.ownerOfSession.delete(pairingId)
        return deleted
    }

    subscribe(pairingId: string, listener: LanPairingListener): () => void {
        let bucket = this.listenerBuckets.get(pairingId)
        if (!bucket) {
            bucket = { listeners: new Set() }
            this.listenerBuckets.set(pairingId, bucket)
        }
        bucket.listeners.add(listener)
        return () => {
            const current = this.listenerBuckets.get(pairingId)
            if (!current) return
            current.listeners.delete(listener)
            if (current.listeners.size === 0) this.listenerBuckets.delete(pairingId)
        }
    }

    private emit(session: PairingSessionRecord): void {
        const bucket = this.listenerBuckets.get(session.id)
        if (!bucket || bucket.listeners.size === 0) return
        const event: PairingHostEvent = { type: 'pairing.updated', pairing: toPairingSessionSnapshot(session) }
        for (const listener of bucket.listeners) listener(event)
    }
}
