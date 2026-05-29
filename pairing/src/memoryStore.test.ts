import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'

function createSessionRecord(now: number, shortCode: string = '123456') {
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
        shortCode,
        approvalStatus: null,
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

    it('promotes a guest to approved when the verify code matches', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '654321')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        const approved = await store.claimAndApprove(session.id, '654321', guest, 1_100)

        expect(approved?.approvalStatus).toBe('approved')
        expect(approved?.guest?.tokenHash).toBe(guest.tokenHash)
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toMatchObject({ role: 'guest' })
    })

    it('rejects a verify-code with the wrong digits and does not write the guest', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '654321')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        await expect(store.claimAndApprove(session.id, '000000', guest, 1_100)).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()
    })

    it('rejects a second claim once the session is already approved', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '111111')
        const first = createParticipantRecord({ token: 'guest-1', label: 'A' })
        const second = createParticipantRecord({ token: 'guest-2', label: 'B' })

        await store.createSession(session)
        await store.claimAndApprove(session.id, '111111', first, 1_100)
        await expect(store.claimAndApprove(session.id, '111111', second, 1_200)).resolves.toBeNull()
    })

    it('removes both host and guest token indexes after deletion', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '222222')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        const claimed = await store.claimAndApprove(session.id, '222222', guest, 1_100)
        expect(claimed?.guest?.tokenHash).toBe(guest.tokenHash)

        await store.deleteSession(session.id, 1_500)

        await expect(store.getSessionByTokenHash(session.host.tokenHash)).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()
    })

    it('renews active sessions for durable device reconnect', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000)
        await store.createSession(session)

        await expect(store.renewSession(session.id, 10_000, 1_500)).resolves.toMatchObject({
            expiresAt: 10_000,
            updatedAt: 1_500,
        })
    })

    it('binds a missing guest device key without overwriting an existing key', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '333333')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        await store.claimAndApprove(session.id, '333333', guest, 1_100)

        const bound = await store.bindGuestDeviceKey(session.id, 'public-key-1', 1_500)
        const rejected = await store.bindGuestDeviceKey(session.id, 'public-key-2', 1_600)

        expect(bound?.guest?.publicKey).toBe('public-key-1')
        expect(bound?.updatedAt).toBe(1_500)
        expect(rejected).toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toMatchObject({ role: 'guest' })
    })

    it('rotates guest tokens for device-key recovery', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '444444')
        const guest = createParticipantRecord({ token: 'guest-old', label: 'Phone' })
        const nextGuest = createParticipantRecord({ token: 'guest-new', label: 'Phone' })

        await store.createSession(session)
        await store.claimAndApprove(session.id, '444444', guest, 1_100)
        const rotated = await store.rotateGuestToken(session.id, nextGuest, 1_500)

        expect(rotated?.guest?.tokenHash).toBe(nextGuest.tokenHash)
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(nextGuest.tokenHash)).resolves.toMatchObject({ role: 'guest' })
    })

    it('issues independent one-time PWA handoff tickets and consumes each once', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000)
        await store.createSession(session)
        await store.issueHandoffTicket(session.id, { tokenHash: 'handoff-a', expiresAt: 2_000 })
        await store.issueHandoffTicket(session.id, { tokenHash: 'handoff-b', expiresAt: 2_000 })

        await expect(store.consumeHandoffTicket(session.id, 'handoff-a', 1_500)).resolves.toBe(true)
        await expect(store.consumeHandoffTicket(session.id, 'handoff-a', 1_500)).resolves.toBe(false)
        await expect(store.consumeHandoffTicket(session.id, 'handoff-b', 1_500)).resolves.toBe(true)
        await expect(store.consumeHandoffTicket(session.id, 'handoff-b', 1_500)).resolves.toBe(false)
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

    it('clears transient reconnect and handoff records when a session expires', async () => {
        let now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)
        await store.issueReconnectChallenge(session.id, 'guest', {
            nonce: 'nonce-expire',
            issuedAt: now,
            expiresAt: now + 500,
        })
        await store.issueHandoffTicket(session.id, { tokenHash: 'handoff-hash', expiresAt: now + 500 })

        now = session.expiresAt + 1

        await expect(store.getSession(session.id)).resolves.toMatchObject({ state: 'expired' })
        await expect(store.consumeReconnectChallenge(session.id, 'guest', 'nonce-expire', now)).resolves.toBe(false)
        await expect(store.consumeHandoffTicket(session.id, 'handoff-hash', now)).resolves.toBe(false)
    })
})
