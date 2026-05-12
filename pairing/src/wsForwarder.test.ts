import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema, type PairingSignalV2 } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'
import { migrateLegacyState } from './storeSupport'
import { PairingSocketHub } from './ws'
import type { PairingSocketLike } from './wsTypes'

function socket(): PairingSocketLike & { sent: unknown[]; closed: Array<{ code?: number; reason?: string }> } {
    return {
        readyState: 1,
        sent: [],
        closed: [],
        send(data: string) { this.sent.push(JSON.parse(data) as unknown) },
        close(code?: number, reason?: string) { this.closed.push({ code, reason }) },
    }
}

async function setup(now = 1_000) {
    const host = createParticipantRecord({ token: 'host-secret' })
    const guest = createParticipantRecord({ token: 'guest-secret' })
    const session = PairingSessionRecordSchema.parse({
        id: 'p1', state: 'active', createdAt: now, updatedAt: now, expiresAt: now + 10_000,
        ticketExpiresAt: now + 5_000, shortCode: null, approvalStatus: null, ticketHash: 'ticket-hash', host, guest: null,
    })
    const store = new MemoryPairingStore(() => now)
    await store.createSession(session)
    await store.claimSession(session.id, guest, '123456')
    await store.approveSession(session.id, now)
    return { store, session, guest }
}

describe('PairingSocketHub forwarder', () => {
    it('forwards raw description signals between attached peers', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket(), guestSocket = socket()
        const signal: PairingSignalV2 = { type: 'description', description: { type: 'offer', sdp: 'v=0' } }
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        await hub.handleMessage(hostSocket, JSON.stringify(signal))
        expect(guestSocket.sent).toEqual([signal])
    })

    it('drops signals while the opposite peer is offline', async () => {
        const { store, session } = await setup()
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.handleMessage(hostSocket, JSON.stringify({ type: 'candidate', candidate: { candidate: 'x' } }))
        expect(hostSocket.closed).toHaveLength(0)
    })

    it('notifies bye to both peers and closes sockets', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket(), guestSocket = socket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        await hub.notifyBye(session.id, 'pairing_unavailable')
        expect(hostSocket.sent).toContainEqual({ type: 'bye', reason: 'pairing_unavailable' })
        expect(guestSocket.closed).toContainEqual({ code: 1000, reason: 'pairing_unavailable' })
    })

    it('collects an empty session when disconnect grace expires', async () => {
        const { store, session } = await setup()
        const hub = new PairingSocketHub({ store, disconnectGraceMs: 1 })
        const hostSocket = socket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.detach(hostSocket)
        await new Promise((resolve) => setTimeout(resolve, 5))
        expect(hub.snapshot().activeSessions).toBe(0)
    })

    it('replaces a same-role socket', async () => {
        const { store, session } = await setup()
        const hub = new PairingSocketHub({ store })
        const first = socket(), second = socket()
        await hub.attach(session.id, session.host.tokenHash, first)
        await hub.attach(session.id, session.host.tokenHash, second)
        expect(first.closed).toContainEqual({ code: 1012, reason: 'replaced' })
    })

    it('migrates legacy session states to active', () => {
        expect(migrateLegacyState('claimed')).toBe('active')
        expect(migrateLegacyState('connected')).toBe('active')
    })

    it('sends bye when attaching to a deleted session', async () => {
        const now = 1_000
        const host = createParticipantRecord({ token: 'host-secret' })
        const session = PairingSessionRecordSchema.parse({
            id: 'deleted-p1', state: 'deleted', createdAt: now, updatedAt: now, expiresAt: now + 10_000,
            ticketExpiresAt: now + 5_000, shortCode: null, approvalStatus: null, ticketHash: 'ticket-hash', host, guest: null,
        })
        const store = new MemoryPairingStore(() => now)
        await store.createSession(session)
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket()
        const attached = await hub.attach(session.id, session.host.tokenHash, hostSocket)
        expect(attached).toBeNull()
        expect(hostSocket.sent).toContainEqual({ type: 'bye', reason: 'pairing_unavailable' })
        expect(hostSocket.closed).toContainEqual({ code: 1000, reason: 'pairing_unavailable' })
    })
})
