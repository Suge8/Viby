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

function cloneSocketView(socket: ReturnType<typeof createSocket>): PairingSocketLike & {
    sent: PairingSignal[]
    closeCalls: Array<{ code?: number; reason?: string }>
} {
    return {
        readyState: socket.readyState,
        sent: socket.sent,
        closeCalls: socket.closeCalls,
        data: socket.data,
        send: socket.send,
        close: socket.close,
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

    it('drops volatile peer signals while the target role is absent', async () => {
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
            JSON.stringify({ pairingId: session.id, type: 'offer', payload: { sdp: 'stale-offer-sdp' } })
        )
        await hub.attach(session.id, guest.tokenHash, guestSocket, 'guest-transport-1')

        expect(guestSocket.sent.some((signal) => signal.type === 'offer')).toBe(false)
        expect(guestSocket.sent.some((signal) => signal.type === 'state')).toBe(true)
        expect(guestSocket.sent.some((signal) => signal.type === 'ready')).toBe(true)
        expect(
            hostSocket.sent.some(
                (signal) =>
                    signal.type === 'ready' &&
                    signal.from === 'guest' &&
                    (signal.payload as { transportId?: string }).transportId === 'guest-transport-1'
            )
        ).toBe(true)
    })

    it('keeps a closed peer connected through disconnect grace before notifying the remaining peer', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        await store.createSession(session)
        await store.claimSession(session.id, guest, '123456')
        await store.approveSession(session.id, now)

        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 1 })
        const hostSocket = createSocket()
        const guestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        hostSocket.sent.length = 0
        guestSocket.sent.length = 0

        await hub.detach(guestSocket)

        expect(hostSocket.sent.some((signal) => signal.type === 'peer-left')).toBe(false)
        expect((await store.getSession(session.id))?.guest?.connectedAt).toBe(now)

        await new Promise((resolve) => setTimeout(resolve, 5))

        expect(hostSocket.sent.some((signal) => signal.type === 'peer-left')).toBe(true)
        expect((await store.getSession(session.id))?.guest?.connectedAt).toBeUndefined()
        expect(guestSocket.sent).toHaveLength(0)
    })

    it('cancels disconnect grace when the same role comes back before timeout', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        await store.createSession(session)
        await store.claimSession(session.id, guest, '123456')
        await store.approveSession(session.id, now)

        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 20 })
        const hostSocket = createSocket()
        const firstGuestSocket = createSocket()
        const secondGuestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, firstGuestSocket)
        hostSocket.sent.length = 0

        await hub.detach(firstGuestSocket)
        await hub.attach(session.id, guest.tokenHash, secondGuestSocket, 'guest-transport-2')
        await new Promise((resolve) => setTimeout(resolve, 30))

        expect(hostSocket.sent.some((signal) => signal.type === 'peer-left')).toBe(false)
        expect(
            hostSocket.sent.some(
                (signal) =>
                    signal.type === 'ready' &&
                    signal.from === 'guest' &&
                    (signal.payload as { transportId?: string }).transportId === 'guest-transport-2'
            )
        ).toBe(true)
        expect((await store.getSession(session.id))?.guest?.connectedAt).toBe(now)
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

    it('ignores stale close callbacks from sockets replaced by the same role', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)

        const hub = new PairingSocketHub({ store, now: () => now })
        const firstHostSocket = createSocket()
        const secondHostSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, firstHostSocket)
        await hub.attach(session.id, session.host.tokenHash, secondHostSocket)
        await hub.detach(firstHostSocket)

        const loaded = await store.getSession(session.id)
        expect(loaded?.host.connectedAt).toBe(now)

        await hub.handleMessage(secondHostSocket, JSON.stringify({ pairingId: session.id, type: 'ping' }))
        expect(secondHostSocket.closeCalls).toHaveLength(0)
    })

    it('throttles connection touch writes so host heartbeats do not starve claim updates', async () => {
        let now = 1_000
        const store = new MemoryPairingStore(() => now)
        const touchConnection = mock(store.touchConnection.bind(store))
        store.touchConnection = touchConnection
        const session = createSessionRecord(now)
        await store.createSession(session)

        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)

        now = 1_001
        await hub.handleMessage(hostSocket, JSON.stringify({ pairingId: session.id, type: 'ping' }))
        expect(touchConnection).toHaveBeenCalledTimes(0)

        now = 16_001
        await hub.handleMessage(hostSocket, JSON.stringify({ pairingId: session.id, type: 'ping' }))
        expect(touchConnection).toHaveBeenCalledTimes(1)
    })

    it('accepts message and close callbacks that arrive with a different websocket wrapper identity', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)

        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 1 })
        const hostOpenSocket = createSocket()
        await hub.attach(session.id, session.host.tokenHash, hostOpenSocket)

        const hostMessageSocket = cloneSocketView(hostOpenSocket)
        hostMessageSocket.data = hostOpenSocket.data
        await hub.handleMessage(hostMessageSocket, JSON.stringify({ pairingId: session.id, type: 'ping' }))

        expect(hostOpenSocket.closeCalls).toHaveLength(0)

        const hostCloseSocket = cloneSocketView(hostOpenSocket)
        hostCloseSocket.data = hostOpenSocket.data
        await hub.detach(hostCloseSocket)
        await new Promise((resolve) => setTimeout(resolve, 5))

        const loaded = await store.getSession(session.id)
        expect(loaded?.host.connectedAt).toBeUndefined()
    })

    it('reports active websocket pressure without exposing session data', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        await store.createSession(session)
        await store.claimSession(session.id, guest, '123456')
        await store.approveSession(session.id, now)

        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 20 })
        const hostSocket = createSocket()
        const guestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        expect(hub.snapshot()).toEqual({
            activeSessions: 1,
            activeSockets: 1,
            pairedSessions: 0,
            disconnectGraceTimers: 0,
        })

        await hub.attach(session.id, guest.tokenHash, guestSocket)
        expect(hub.snapshot()).toEqual({
            activeSessions: 1,
            activeSockets: 2,
            pairedSessions: 1,
            disconnectGraceTimers: 0,
        })

        await hub.detach(guestSocket)
        expect(hub.snapshot()).toEqual({
            activeSessions: 1,
            activeSockets: 1,
            pairedSessions: 0,
            disconnectGraceTimers: 1,
        })
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
