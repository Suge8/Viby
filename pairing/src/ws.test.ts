import { describe, expect, it, mock } from 'bun:test'
import { type PairingRtcSignal, PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'

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
        shortCode: '123456',
        approvalStatus: null,
        host,
        authorizedDevice: null,
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
    await store.verifyCodeAndApprove(
        session.id,
        '123456',
        createAuthorizedDevice(guest, now),
        createConnection(guest),
        now
    )
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

    it('does not rebuild WebRTC for a same-token signaling socket refresh', async () => {
        const now = 1_000
        const { store, session, guest } = await createClaimedStore(now)
        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const firstGuestSocket = createSocket()
        const secondGuestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, firstGuestSocket)
        await hub.attach(session.id, guest.tokenHash, secondGuestSocket)

        expect(hostSocket.sent).not.toContainEqual({ type: 'peer-replaced' })
    })

    it('notifies the host when a new guest connection replaces the direct signaling peer', async () => {
        const now = 1_000
        const { store, session, guest } = await createClaimedStore(now)
        const pwaGuest = createParticipantRecord({ token: 'pwa-secret', label: 'Phone PWA' })
        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const browserSocket = createSocket()
        const pwaSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, browserSocket)
        expect(hostSocket.sent).not.toContainEqual({ type: 'peer-replaced' })

        await store.addRemoteConnection(session.id, createConnection(pwaGuest), now)
        await hub.attach(session.id, pwaGuest.tokenHash, pwaSocket)

        expect(hostSocket.sent).toContainEqual({ type: 'peer-replaced' })
    })

    it('rejects client-forged peer replacement control messages', async () => {
        const { store, session } = await createClaimedStore(1_000)
        const traces: unknown[] = []
        const hub = new PairingSocketHub({ store, onTrace: (event) => traces.push(event) })
        const hostSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.handleMessage(hostSocket, JSON.stringify({ type: 'peer-replaced' }))

        expect(hostSocket.closeCalls).toContainEqual({ code: 1003, reason: 'invalid-message' })
        expect(traces).toContainEqual({
            pairingId: session.id,
            event: 'tunnel.frame-drop',
            payloadMeta: { role: 'host', reason: 'invalid-message' },
        })
    })

    it('emits pairing-scoped broker trace events for attach and detach', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)
        const traces: unknown[] = []
        const hub = new PairingSocketHub({ store, now: () => now, onTrace: (event) => traces.push(event) })
        const hostSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.detach(hostSocket)

        expect(traces).toEqual([
            {
                pairingId: session.id,
                event: 'ws.open',
                payloadMeta: { role: 'host', connectionId: session.host.tokenHash },
            },
            {
                pairingId: session.id,
                event: 'ws.close',
                payloadMeta: { role: 'host', connectionId: session.host.tokenHash },
            },
        ])
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

        expect(firstHostSocket.data).toEqual({})
        expect(secondHostSocket.closeCalls).toHaveLength(0)
        expect(hub.snapshot().activeSockets).toBe(1)
    })

    it('accepts message and close callbacks with a websocket wrapper identity', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)
        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 1 })
        const hostOpenSocket = createSocket()
        await hub.attach(session.id, session.host.tokenHash, hostOpenSocket)

        await hub.handleMessage(
            cloneSocketView(hostOpenSocket),
            JSON.stringify({ type: 'candidate', candidate: { candidate: 'x' } })
        )
        await hub.detach(cloneSocketView(hostOpenSocket))
        await new Promise((resolve) => setTimeout(resolve, 5))

        await hub.handleMessage(hostOpenSocket, JSON.stringify({ type: 'candidate', candidate: { candidate: 'x' } }))

        expect(hostOpenSocket.data).toEqual({})
        expect(hostOpenSocket.closeCalls).toEqual([{ code: 1008, reason: 'not-attached' }])
        expect(hub.snapshot().activeSessions).toBe(0)
    })

    it('reports active websocket pressure without exposing session data', async () => {
        const now = 1_000
        const { store, session, guest } = await createClaimedStore(now)
        const hub = new PairingSocketHub({ store, now: () => now, disconnectGraceMs: 20 })
        const hostSocket = createSocket()
        const guestSocket = createSocket()

        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        expect(hub.snapshot()).toEqual({
            activeSessions: 1,
            activeSockets: 1,
            activeRemoteConnections: 0,
            disconnectGraceByRole: { guest: 0, host: 0 },
            disconnectGraceTimers: 0,
            maxRemoteConnectionsPerPairing: 0,
            pairedSessions: 0,
            pairingsWithRemoteConnections: 0,
        })
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        expect(hub.snapshot()).toEqual({
            activeSessions: 1,
            activeSockets: 2,
            activeRemoteConnections: 1,
            disconnectGraceByRole: { guest: 0, host: 0 },
            disconnectGraceTimers: 0,
            maxRemoteConnectionsPerPairing: 1,
            pairedSessions: 1,
            pairingsWithRemoteConnections: 1,
        })
        await hub.detach(guestSocket)
        expect(hub.snapshot()).toEqual({
            activeSessions: 1,
            activeSockets: 1,
            activeRemoteConnections: 0,
            disconnectGraceByRole: { guest: 1, host: 0 },
            disconnectGraceTimers: 1,
            maxRemoteConnectionsPerPairing: 0,
            pairedSessions: 0,
            pairingsWithRemoteConnections: 0,
        })
    })

    it('schedules and cancels disconnect grace through the injected scheduler', async () => {
        const now = 1_000
        const store = new MemoryPairingStore(() => now)
        const session = createSessionRecord(now)
        await store.createSession(session)
        const scheduled: Array<{ callback: () => void; cancelled: boolean; delayMs: number }> = []
        const hub = new PairingSocketHub({
            store,
            now: () => now,
            disconnectGraceMs: 20,
            scheduleTimeout: (callback, delayMs) => {
                const entry = { callback, cancelled: false, delayMs }
                scheduled.push(entry)
                return () => {
                    entry.cancelled = true
                }
            },
        })
        const hostSocket = createSocket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.detach(hostSocket)

        expect(scheduled).toMatchObject([{ delayMs: 20, cancelled: false }])
        expect(hub.snapshot().disconnectGraceTimers).toBe(1)

        const nextHostSocket = createSocket()
        await hub.attach(session.id, session.host.tokenHash, nextHostSocket)

        expect(scheduled[0].cancelled).toBe(true)
        expect(hub.snapshot().disconnectGraceTimers).toBe(0)
    })

    it('forwards raw V2 signals only when the opposite role is online', async () => {
        const now = 1_000
        const { store, session, guest } = await createClaimedStore(now)
        const hub = new PairingSocketHub({ store, now: () => now })
        const hostSocket = createSocket()
        const guestSocket = createSocket()
        const signal: PairingRtcSignal = { type: 'description', description: { type: 'offer', sdp: 'v=0' } }

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
