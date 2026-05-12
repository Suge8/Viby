import { describe, expect, it, mock } from 'bun:test'
import { PairingSessionRecordSchema, type PairingSignalV2 } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'
import { PairingSocketHub } from './ws'
import type { PairingSocketLike } from './wsTypes'

function createSessionRecord(now: number) {
    const host = createParticipantRecord({ token: 'host-secret', label: 'Host device' })
    return PairingSessionRecordSchema.parse({
        id: 'pairing-ws-1',
        state: 'active',
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
    sent: unknown[]
    closeCalls: Array<{ code?: number; reason?: string }>
} {
    const sent: unknown[] = []
    const closeCalls: Array<{ code?: number; reason?: string }> = []
    return {
        readyState: 1,
        sent,
        closeCalls,
        send: mock((payload: string) => sent.push(JSON.parse(payload) as unknown)),
        close: mock((code?: number, reason?: string) => closeCalls.push({ code, reason })),
    }
}

function cloneSocketView(socket: ReturnType<typeof createSocket>): PairingSocketLike {
    return { readyState: socket.readyState, data: socket.data, send: socket.send, close: socket.close }
}

async function createClaimedStore(now: number) {
    const store = new MemoryPairingStore(() => now)
    const session = createSessionRecord(now)
    const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
    await store.createSession(session)
    await store.claimSession(session.id, guest, '123456')
    await store.approveSession(session.id, now)
    return { store, session, guest }
}

describe('PairingSocketHub', () => {
    it('rejects unauthorized socket attachments', async () => {
        const store = new MemoryPairingStore(() => 1_000)
        const hub = new PairingSocketHub({ store, now: () => 1_000 })
        const socket = createSocket()

        const attached = await hub.attach('pairing-missing', 'unknown-token', socket)

        expect(attached).toBeNull()
        expect(socket.closeCalls).toEqual([{ code: 1008, reason: 'invalid_token' }])
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

    it('ignores stale callbacks from sockets replaced by the same role', async () => {
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
        await hub.handleMessage(secondHostSocket, JSON.stringify({ type: 'candidate', candidate: { candidate: 'x' } }))

        expect(secondHostSocket.closeCalls).toHaveLength(0)
    })

    it('accepts message and close callbacks with a websocket wrapper identity', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)
        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 1 })
        const hostOpenSocket = createSocket()
        await hub.attach(session.id, session.host.tokenHash, hostOpenSocket)

        await hub.handleMessage(cloneSocketView(hostOpenSocket), JSON.stringify({ type: 'candidate', candidate: { candidate: 'x' } }))
        await hub.detach(cloneSocketView(hostOpenSocket))
        await new Promise((resolve) => setTimeout(resolve, 5))

        expect(hostOpenSocket.closeCalls).toHaveLength(0)
        expect(hub.snapshot().activeSessions).toBe(0)
    })

    it('reports active websocket pressure without exposing session data', async () => {
        const now = 1_000
        const { store, session, guest } = await createClaimedStore(now)
        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 20 })
        const hostSocket = createSocket()
        const guestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        expect(hub.snapshot()).toEqual({ activeSessions: 1, activeSockets: 1, pairedSessions: 0, disconnectGraceTimers: 0 })
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        expect(hub.snapshot()).toEqual({ activeSessions: 1, activeSockets: 2, pairedSessions: 1, disconnectGraceTimers: 0 })
        await hub.detach(guestSocket)
        expect(hub.snapshot()).toEqual({ activeSessions: 1, activeSockets: 1, pairedSessions: 0, disconnectGraceTimers: 1 })
    })

    it('forwards raw V2 signals only when the opposite role is online', async () => {
        const now = 1_000
        const { store, session, guest } = await createClaimedStore(now)
        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const guestSocket = createSocket()
        const signal: PairingSignalV2 = { type: 'description', description: { type: 'offer', sdp: 'v=0' } }

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.handleMessage(hostSocket, JSON.stringify(signal))
        expect(guestSocket.sent).toHaveLength(0)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        await hub.handleMessage(hostSocket, JSON.stringify(signal))
        expect(guestSocket.sent).toEqual([signal])
    })

    it('sends bye and closes sockets on explicit notification', async () => {
        const now = 1_000
        const { store, session, guest } = await createClaimedStore(now)
        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const guestSocket = createSocket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)

        await hub.notifyBye(session.id, 'pairing_unavailable')

        expect(hostSocket.sent).toContainEqual({ type: 'bye', reason: 'pairing_unavailable' })
        expect(guestSocket.sent).toContainEqual({ type: 'bye', reason: 'pairing_unavailable' })
        expect(hostSocket.closeCalls).toContainEqual({ code: 1000, reason: 'pairing_unavailable' })
        expect(guestSocket.closeCalls).toContainEqual({ code: 1000, reason: 'pairing_unavailable' })
    })
})
