import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'

function createSessionRecord(now: number) {
    const host = createParticipantRecord({
        token: 'host-secret',
        label: 'Host device',
    })

    return PairingSessionRecordSchema.parse({
        id: 'pairing-1',
        state: 'waiting',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 1_000,
        ticketExpiresAt: now + 500,
        shortCode: null,
        approvalStatus: null,
        ticketHash: 'ticket-hash',
        host,
        guest: null,
    })
}

describe('MemoryPairingStore', () => {
    it('expires sessions and clears the host token index', async () => {
        let now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)

        await store.createSession(session)
        now = session.expiresAt + 1

        const expired = await store.getSession(session.id)
        const identity = await store.getSessionByTokenHash(session.host.tokenHash)

        expect(expired?.state).toBe('expired')
        expect(identity).toBeNull()
    })

    it('removes both host and guest token indexes after deletion', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000)
        const guest = createParticipantRecord({
            token: 'guest-secret',
            label: 'Phone',
        })

        await store.createSession(session)
        const claimed = await store.claimSession(session.id, guest, '123456')
        expect(claimed?.guest?.tokenHash).toBe(guest.tokenHash)

        await store.deleteSession(session.id, 1_500)

        await expect(store.getSessionByTokenHash(session.host.tokenHash)).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()
    })

    it('issues one-time reconnect challenges and consumes them once', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000)
        await store.createSession(session)

        await store.issueReconnectChallenge(session.id, 'guest', {
            nonce: 'nonce-1',
            issuedAt: 1_000,
            expiresAt: 2_000,
        })

        await expect(store.consumeReconnectChallenge(session.id, 'guest', 'nonce-1', 1_500)).resolves.toBe(true)
        await expect(store.consumeReconnectChallenge(session.id, 'guest', 'nonce-1', 1_500)).resolves.toBe(false)
    })

    it('clears reconnect challenges when a session expires', async () => {
        let now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)
        await store.issueReconnectChallenge(session.id, 'guest', {
            nonce: 'nonce-expire',
            issuedAt: now,
            expiresAt: now + 500,
        })

        now = session.expiresAt + 1

        await expect(store.getSession(session.id)).resolves.toMatchObject({ state: 'expired' })
        await expect(store.consumeReconnectChallenge(session.id, 'guest', 'nonce-expire', now)).resolves.toBe(false)
    })
})
