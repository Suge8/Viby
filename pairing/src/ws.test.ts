import { describe, expect, it, mock } from 'bun:test'
import type { PairingSignal } from '@viby/protocol/pairing'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'
import { PairingSocketHub } from './ws'
import type { PairingSocketLike } from './wsTypes'

function createSessionRecord(now: number) {
    const host = createParticipantRecord({ token: 'host-secret', label: 'Host device' })
    return PairingSessionRecordSchema.parse({
        id: 'pairing-ws-1',
        state: 'waiting',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 10_000,
        ticketExpiresAt: now + 5_000,
        shortCode: null,
        approvalStatus: null,
        ticketHash: 'ticket-hash',
        host,
        guest: null,
    })
}

function createSocket(): PairingSocketLike & {
    sent: PairingSignal[]
    closeCalls: Array<{ code?: number; reason?: string }>
} {
    const sent: PairingSignal[] = []
    const closeCalls: Array<{ code?: number; reason?: string }> = []
    return {
        readyState: 1,
        sent,
        closeCalls,
        send: mock((data: string) => {
            sent.push(JSON.parse(data) as PairingSignal)
        }),
        close: mock((code?: number, reason?: string) => {
            closeCalls.push({ code, reason })
        }),
    }
}

describe('PairingSocketHub', () => {
    it('rejects unauthorized socket attachments', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const hub = new PairingSocketHub({ store, now: () => 1_000 })
        const socket = createSocket()

        const attached = await hub.attach('pairing-missing', 'unknown-token', socket)

        expect(attached).toBeNull()
        expect(socket.closeCalls).toEqual([{ code: 1008, reason: 'unauthorized' }])
    })

    it('queues peer signals until the other role attaches, then flushes them', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        await store.createSession(session)
        const claimed = await store.claimSession(session.id, guest, '123456')
        expect(claimed?.guest?.tokenHash).toBe(guest.tokenHash)
        await store.approveSession(session.id, now)

        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const guestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        hostSocket.sent.length = 0

        await hub.handleMessage(
            hostSocket,
            JSON.stringify({ pairingId: session.id, type: 'offer', payload: { sdp: 'offer-sdp' } })
        )

        expect(guestSocket.sent).toHaveLength(0)

        await hub.attach(session.id, guest.tokenHash, guestSocket)

        expect(guestSocket.sent.some((signal) => signal.type === 'offer')).toBe(true)
        expect(guestSocket.sent.some((signal) => signal.type === 'state')).toBe(true)
        expect(guestSocket.sent.some((signal) => signal.type === 'ready')).toBe(true)
        expect(hostSocket.sent.some((signal) => signal.type === 'ready')).toBe(true)
    })

    it('notifies the remaining peer when the other side disconnects', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        await store.createSession(session)
        await store.claimSession(session.id, guest, '123456')
        await store.approveSession(session.id, now)

        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const guestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        hostSocket.sent.length = 0
        guestSocket.sent.length = 0

        await hub.detach(guestSocket)

        expect(hostSocket.sent.some((signal) => signal.type === 'peer-left')).toBe(true)
        expect(guestSocket.sent).toHaveLength(0)
    })

    it('replaces an existing socket when the same role attaches again', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)

        const hub = new PairingSocketHub({ store, now: () => now })
        const firstHostSocket = createSocket()
        const secondHostSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, firstHostSocket)
        await hub.attach(session.id, session.host.tokenHash, secondHostSocket)

        expect(firstHostSocket.closeCalls).toContainEqual({ code: 1012, reason: 'replaced' })
        expect(secondHostSocket.closeCalls).toHaveLength(0)
    })

    it('emits expire and closes sockets when a session is closed', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        await store.createSession(session)
        const claimed = await store.claimSession(session.id, guest, '123456')
        const approved = await store.approveSession(session.id, now)
        expect(claimed?.guest?.tokenHash).toBe(guest.tokenHash)
        expect(approved?.approvalStatus).toBe('approved')

        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const guestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        hostSocket.sent.length = 0
        guestSocket.sent.length = 0

        await hub.closeSession(
            session.id,
            {
                ...approved!,
                state: 'deleted',
            },
            'deleted'
        )

        expect(hostSocket.sent.some((signal) => signal.type === 'expire')).toBe(true)
        expect(guestSocket.sent.some((signal) => signal.type === 'expire')).toBe(true)
        expect(hostSocket.closeCalls).toContainEqual({ code: 1000, reason: 'deleted' })
        expect(guestSocket.closeCalls).toContainEqual({ code: 1000, reason: 'deleted' })
    })
})
