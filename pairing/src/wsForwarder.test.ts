import { describe, expect, it } from 'bun:test'
import {
    PairingBrokerTunnelMessageSchema,
    type PairingRtcSignal,
    PairingSessionRecordSchema,
    type PairingTunnelRelayFrame,
} from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'
import { PairingSocketHub } from './ws'
import { shouldBufferPairingTunnelMessage } from './wsBufferPolicy'
import type { PairingSocketLike } from './wsTypes'

function socket(): PairingSocketLike & { sent: unknown[]; closed: Array<{ code?: number; reason?: string }> } {
    return {
        readyState: 1,
        sent: [],
        closed: [],
        send(data: string) {
            this.sent.push(JSON.parse(data) as unknown)
        },
        close(code?: number, reason?: string) {
            this.closed.push({ code, reason })
        },
    }
}

async function setup(now = 1_000) {
    const host = createParticipantRecord({ token: 'host-secret' })
    const guest = createParticipantRecord({ token: 'guest-secret' })
    const session = PairingSessionRecordSchema.parse({
        id: 'p1',
        state: 'active',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 10_000,
        shortCode: '123456',
        approvalStatus: null,
        host,
        guest: null,
    })
    const store = new MemoryPairingStore(() => now)
    await store.createSession(session)
    await store.claimAndApprove(session.id, '123456', guest, now)
    return { store, session, guest }
}

describe('PairingSocketHub forwarder', () => {
    it('forwards raw description signals between attached peers', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket(),
            guestSocket = socket()
        const signal: PairingRtcSignal = { type: 'description', description: { type: 'offer', sdp: 'v=0' } }
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        await hub.handleMessage(hostSocket, JSON.stringify(signal))
        expect(guestSocket.sent).toEqual([signal])
    })

    it('forwards tunnel frames through a separate relay schema', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store, messageSchema: PairingBrokerTunnelMessageSchema })
        const hostSocket = socket(),
            guestSocket = socket()
        const frame: PairingTunnelRelayFrame = {
            kind: 'sealed',
            id: 'frame-1',
            seq: 0,
            nonce: 'nonce',
            ciphertext: 'body',
        }
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        await hub.handleMessage(hostSocket, JSON.stringify(frame))
        expect(guestSocket.sent).toEqual([frame])
    })

    it('buffers only tunnel key frames for a late peer', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({
            store,
            bufferMessages: true,
            maxBufferedMessagesPerRole: 4,
            messageSchema: PairingBrokerTunnelMessageSchema,
            shouldBufferMessage: shouldBufferPairingTunnelMessage,
        })
        const hostSocket = socket(),
            guestSocket = socket()
        const keyFrame: PairingTunnelRelayFrame = {
            kind: 'key',
            id: 'guest-key',
            seq: 0,
            publicKey: 'public-key',
        }
        const sealedFrame: PairingTunnelRelayFrame = {
            kind: 'sealed',
            id: 'stale-sealed',
            seq: 1,
            nonce: 'nonce',
            ciphertext: 'body',
        }

        await hub.attach(session.id, guest.tokenHash, guestSocket)
        await hub.handleMessage(guestSocket, JSON.stringify(keyFrame))
        await hub.handleMessage(guestSocket, JSON.stringify(sealedFrame))
        await hub.attach(session.id, session.host.tokenHash, hostSocket)

        expect(hostSocket.sent).toEqual([keyFrame])
    })

    it('rejects malformed socket messages before forwarding', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket(),
            guestSocket = socket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        await hub.handleMessage(hostSocket, JSON.stringify({ kind: 'message', payload: {} }))
        expect(hostSocket.closed).toContainEqual({ code: 1003, reason: 'invalid-message' })
        expect(guestSocket.sent).toHaveLength(0)
    })

    it('drops signals while the opposite peer is offline', async () => {
        const { store, session } = await setup()
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.handleMessage(hostSocket, JSON.stringify({ type: 'candidate', candidate: { candidate: 'x' } }))
        expect(hostSocket.closed).toHaveLength(0)
    })

    it('buffers signaling messages for a late peer when enabled', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store, bufferMessages: true })
        const hostSocket = socket(),
            guestSocket = socket()
        const signal: PairingRtcSignal = { type: 'description', description: { type: 'offer', sdp: 'v=0' } }
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        await hub.handleMessage(hostSocket, JSON.stringify(signal))
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        expect(guestSocket.sent).toEqual([signal])
    })

    it('keeps only the newest buffered signaling messages per role', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store, bufferMessages: true, maxBufferedMessagesPerRole: 2 })
        const hostSocket = socket(),
            guestSocket = socket()
        await hub.attach(session.id, session.host.tokenHash, hostSocket)
        for (const candidate of ['one', 'two', 'three']) {
            await hub.handleMessage(hostSocket, JSON.stringify({ type: 'candidate', candidate: { candidate } }))
        }
        await hub.attach(session.id, guest.tokenHash, guestSocket)
        expect(guestSocket.sent).toEqual([
            { type: 'candidate', candidate: { candidate: 'two' } },
            { type: 'candidate', candidate: { candidate: 'three' } },
        ])
    })

    it('notifies bye to both peers and closes sockets', async () => {
        const { store, session, guest } = await setup()
        const hub = new PairingSocketHub({ store })
        const hostSocket = socket(),
            guestSocket = socket()
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
        const first = socket(),
            second = socket()
        await hub.attach(session.id, session.host.tokenHash, first)
        await hub.attach(session.id, session.host.tokenHash, second)
        expect(first.closed).toContainEqual({ code: 1012, reason: 'replaced' })
    })

    it('sends bye when attaching to a deleted session', async () => {
        const now = 1_000
        const host = createParticipantRecord({ token: 'host-secret' })
        const session = PairingSessionRecordSchema.parse({
            id: 'deleted-p1',
            state: 'deleted',
            createdAt: now,
            updatedAt: now,
            expiresAt: now + 10_000,
            shortCode: '123456',
            approvalStatus: null,
            host,
            guest: null,
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
