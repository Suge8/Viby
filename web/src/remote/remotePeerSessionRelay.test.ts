import { PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS } from '@viby/protocol'
import { createPairingTunnelCipher, createPairingTunnelKeyFrame } from '@viby/protocol/pairing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RemotePairingRelayWebSocket } from './remotePairingRelaySocket'
import { createRemotePeerSessionRelay } from './remotePeerSessionRelay'

/**
 * D2 — iOS "locked phone, came back, spinner forever".
 *
 * Backgrounded Safari can suspend the relay WebSocket without firing `onclose`:
 * `readyState` stays OPEN while no frame ever arrives again, so reconnect gated
 * on `readyState === 'closed'` is a silent no-op. The real recovery is the
 * heartbeat ack-deadline: a foreground pulse re-checks staleness against the
 * wall clock and forces a reconnect even though the socket still claims OPEN.
 *
 * This drives the real `createRemotePeerSessionRelay` wiring end-to-end (real
 * relay socket + real heartbeat + real sealed key exchange) and asserts the
 * forced reconnect actually closes the dead socket and opens a fresh one. The
 * clock is injected (not vi.useFakeTimers) so the real WebCrypto key exchange
 * runs on real microtasks while heartbeat timing stays deterministic.
 */

class FakeWebSocket implements RemotePairingRelayWebSocket {
    static readonly OPEN = 1
    onclose: ((event: { code: number; reason: string }) => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    onopen: (() => void) | null = null
    readyState = 0
    readonly sent: string[] = []

    constructor(readonly url: string) {}

    open(): void {
        this.readyState = FakeWebSocket.OPEN
        this.onopen?.()
    }

    emitMessage(data: unknown): void {
        this.onmessage?.({ data })
    }

    /** Suspend: stop delivering frames but keep claiming OPEN, never fire onclose. */
    suspend(): void {
        this.onmessage = null
    }

    close(): void {
        if (this.readyState === 3) return
        this.readyState = 3
        this.onclose?.({ code: 1000, reason: '' })
    }

    send(data: string): void {
        this.sent.push(data)
    }
}

interface ManualClock {
    now(): number
    setSystemTime(at: number): void
    /** Fire every captured (not-yet-cancelled) one-shot timer once. */
    fireTimeouts(): void
    scheduleTimeout: (callback: () => void, delayMs: number) => () => void
    scheduleInterval: (callback: () => void, intervalMs: number) => () => void
}

function createManualClock(): ManualClock {
    let current = 0
    const pending = new Set<() => void>()
    return {
        now: () => current,
        setSystemTime: (at) => {
            current = at
        },
        fireTimeouts: () => {
            const due = [...pending]
            pending.clear()
            for (const callback of due) callback()
        },
        // Heartbeat deadlines / reconnect delays are captured, not auto-fired,
        // so a suspended (frozen-timer) socket is modeled exactly; the test
        // drives staleness via setSystemTime + notifyForeground.
        scheduleTimeout: (callback) => {
            pending.add(callback)
            return () => pending.delete(callback)
        },
        scheduleInterval: () => () => {},
    }
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
    const deadline = Date.now() + 1_000
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error(message)
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

describe('createRemotePeerSessionRelay — iOS suspended-socket recovery (D2)', () => {
    let sockets: FakeWebSocket[]
    let clock: ManualClock
    let timeouts: number

    beforeEach(() => {
        sockets = []
        clock = createManualClock()
        timeouts = 0
    })

    afterEach(() => {
        sockets = []
    })

    async function openRelayToReady(): Promise<ReturnType<typeof createRemotePeerSessionRelay>> {
        // Mirrors RemotePeerSession.handleRelayHeartbeatTimeout: a missed ack
        // deadline forces the relay socket to reconnect.
        const built = createRemotePeerSessionRelay({
            tunnelUrl: 'wss://pair.example/tunnel',
            onOpen: () => {},
            onClose: () => {},
            onFatal: () => {},
            onMessage: () => {},
            onHeartbeatTimeout: () => {
                timeouts += 1
                built.relay.reconnect()
            },
            now: clock.now,
            scheduleTimeout: clock.scheduleTimeout,
            scheduleInterval: clock.scheduleInterval,
            socketFactory: (url) => {
                const socket = new FakeWebSocket(url)
                sockets.push(socket)
                return socket
            },
        })
        const socket = sockets[0]
        socket.open()
        // Real WebCrypto runs on the macrotask queue, so poll (real timers)
        // until the relay has created its cipher and sent its local key.
        await waitFor(() => socket.sent.length > 0, 'relay never sent its local key')
        const peerCipher = await createPairingTunnelCipher()
        socket.emitMessage(
            JSON.stringify(createPairingTunnelKeyFrame({ id: 'peer-key', seq: 0, publicKey: peerCipher.publicKey }))
        )
        // Receive peer key → reach 'open' → start heartbeat (sends one).
        await waitFor(() => built.relay.readyState === 'open', 'relay never reached open')
        return built
    }

    it('forces a reconnect when a foreground pulse hits an open-but-silent socket', async () => {
        const built = await openRelayToReady()
        expect(built.relay.readyState).toBe('open')
        expect(sockets).toHaveLength(1)

        // iOS suspends: the socket still claims OPEN, no ack will ever arrive,
        // and the ack-deadline timer was frozen while backgrounded.
        sockets[0].suspend()
        clock.setSystemTime(PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS + 1)

        // Resume burst: the foreground pulse re-checks the stale heartbeat.
        built.heartbeat.notifyForeground()

        expect(timeouts).toBe(1)
        expect(sockets[0].readyState).toBe(3) // dead socket force-closed
        // The forced close armed a reconnect; firing it opens a fresh socket.
        clock.fireTimeouts()
        expect(sockets).toHaveLength(2)
        expect(sockets.at(-1)?.url).toBe('wss://pair.example/tunnel')
    })

    it('does not reconnect when the socket is still answering heartbeats', async () => {
        const built = await openRelayToReady()
        // Ack the pending heartbeat before the deadline.
        built.heartbeat.markAck()
        clock.setSystemTime(PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS + 1)

        built.heartbeat.notifyForeground()

        expect(timeouts).toBe(0)
        expect(sockets[0].readyState).toBe(FakeWebSocket.OPEN)
        expect(sockets).toHaveLength(1)
    })
})
