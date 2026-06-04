import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'

function createAuthorizedDevice(guest: ReturnType<typeof createParticipantRecord>, at: number) {
    return {
        id: guest.publicKey ?? guest.tokenHash,
        publicKey: guest.publicKey ?? guest.tokenHash,
        label: guest.label,
        metadata: guest.metadata,
        authorizedAt: at,
        lastSeenAt: at,
    }
}

function createConnection(participant: ReturnType<typeof createParticipantRecord>) {
    return { connectionId: participant.tokenHash, participant }
}

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
        authorizedDevice: null,
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
        const approved = await store.verifyCodeAndApprove(
            session.id,
            '654321',
            createAuthorizedDevice(guest, 1_100),
            createConnection(guest),
            1_100
        )

        expect(approved?.approvalStatus).toBe('approved')
        expect(approved?.authorizedDevice?.id).toBe(guest.tokenHash)
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toMatchObject({ role: 'guest' })
    })

    it('returns the persisted connection id so socket liveness can match the stored record', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '424242')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        await store.verifyCodeAndApprove(
            session.id,
            '424242',
            createAuthorizedDevice(guest, 1_100),
            { connectionId: 'conn-not-token', participant: guest },
            1_100
        )

        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toMatchObject({
            role: 'guest',
            connectionId: 'conn-not-token',
        })
        const [connection] = await store.getRemoteConnections(session.id)
        expect(connection.connectionId).toBe('conn-not-token')
    })

    it('rejects a verify-code with the wrong digits and does not write the guest', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '654321')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        await expect(
            store.verifyCodeAndApprove(
                session.id,
                '000000',
                createAuthorizedDevice(guest, 1_100),
                createConnection(guest),
                1_100
            )
        ).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()
    })

    it('rejects a second verify-code approval once the session is already approved', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '111111')
        const first = createParticipantRecord({ token: 'guest-1', label: 'A' })
        const second = createParticipantRecord({ token: 'guest-2', label: 'B' })

        await store.createSession(session)
        await store.verifyCodeAndApprove(
            session.id,
            '111111',
            createAuthorizedDevice(first, 1_100),
            createConnection(first),
            1_100
        )
        await expect(
            store.verifyCodeAndApprove(
                session.id,
                '111111',
                createAuthorizedDevice(second, 1_200),
                createConnection(second),
                1_200
            )
        ).resolves.toBeNull()
    })

    it('removes every guest connection token index after deletion', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '222222')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const pwaGuest = createParticipantRecord({ token: 'pwa-secret', label: 'PWA' })

        await store.createSession(session)
        await store.verifyCodeAndApprove(
            session.id,
            '222222',
            createAuthorizedDevice(guest, 1_100),
            createConnection(guest),
            1_100
        )
        await store.addRemoteConnection(session.id, createConnection(pwaGuest), 1_200)
        await expect(store.getSessionByTokenHash(pwaGuest.tokenHash)).resolves.toMatchObject({ role: 'guest' })

        await store.deleteSession(session.id, 1_500)

        await expect(store.getSessionByTokenHash(session.host.tokenHash)).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(pwaGuest.tokenHash)).resolves.toBeNull()
    })

    it('removes both host and guest token indexes after deletion', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '222222')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        const verified = await store.verifyCodeAndApprove(
            session.id,
            '222222',
            createAuthorizedDevice(guest, 1_100),
            createConnection(guest),
            1_100
        )
        expect(verified?.authorizedDevice?.id).toBe(guest.tokenHash)

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

    it('tracks remote connection liveness separately from authorization', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const session = createSessionRecord(1_000, '555555')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const pwaGuest = createParticipantRecord({ token: 'pwa-secret', label: 'PWA' })

        await store.createSession(session)
        await store.verifyCodeAndApprove(
            session.id,
            '555555',
            createAuthorizedDevice(guest, 1_100),
            createConnection(guest),
            1_100
        )
        await store.addRemoteConnection(session.id, createConnection(pwaGuest), 1_200)
        await store.markRemoteConnectionConnected(session.id, pwaGuest.tokenHash, 1_300)
        await expect(store.getRemoteConnections(session.id)).resolves.toContainEqual(
            expect.objectContaining({ id: pwaGuest.tokenHash, connectedAt: 1_300, lastSeenAt: 1_300 })
        )

        await store.markRemoteConnectionDisconnected(session.id, pwaGuest.tokenHash, 1_400)
        await expect(store.getRemoteConnections(session.id)).resolves.toContainEqual(
            expect.objectContaining({ id: pwaGuest.tokenHash, connectedAt: undefined, lastSeenAt: 1_400 })
        )
    })

    it('clears guest connection token indexes when a session expires', async () => {
        let now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now, '555555')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const pwaGuest = createParticipantRecord({ token: 'pwa-secret', label: 'PWA' })

        await store.createSession(session)
        await store.verifyCodeAndApprove(
            session.id,
            '555555',
            createAuthorizedDevice(guest, 1_100),
            createConnection(guest),
            1_100
        )
        await store.addRemoteConnection(session.id, createConnection(pwaGuest), 1_200)
        now = session.expiresAt + 1

        await expect(store.getSession(session.id)).resolves.toMatchObject({ state: 'expired' })
        await expect(store.getSessionByTokenHash(pwaGuest.tokenHash)).resolves.toBeNull()
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
