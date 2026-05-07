import { describe, expect, it, mock } from 'bun:test'
import { PAIRING_SIGNAL_PING_INTERVAL_MS } from '@viby/protocol/pairing'
import type { DesktopPairingSession } from '@/types'
import { createPairingBridgeSignalSocketController } from './pairingBridgeSignalSocket'

type Listener = () => void

class FakeWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static instances: FakeWebSocket[] = []

    readonly sent: string[] = []
    readyState = FakeWebSocket.CONNECTING
    private readonly listeners = new Map<string, Listener[]>()

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this)
    }

    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }

    send(payload: string): void {
        this.sent.push(payload)
    }

    open(): void {
        this.readyState = FakeWebSocket.OPEN
        this.emit('open')
    }

    close(): void {
        this.readyState = 3
        this.emit('close')
    }

    private emit(type: string): void {
        for (const listener of this.listeners.get(type) ?? []) listener()
    }
}

function createPairing(): DesktopPairingSession {
    return {
        pairing: {
            id: 'pairing-1',
            state: 'connected',
            createdAt: 1,
            updatedAt: 1,
            expiresAt: 10,
            ticketExpiresAt: 5,
            shortCode: '123456',
            approvalStatus: 'approved',
            host: { tokenHint: 'host' },
            guest: { tokenHint: 'guest' },
        },
        hostToken: 'host-token',
        pairingUrl: 'https://pair.example/p/pairing-1',
        wsUrl: 'wss://pair.example/pairings/pairing-1/ws?token=host-token',
        iceServers: [],
    }
}

describe('pairingBridgeSignalSocket', () => {
    it('keeps desktop signaling warm with protocol pings and clears them on close', () => {
        const originalWebSocket = globalThis.WebSocket
        const originalSetInterval = globalThis.setInterval
        const originalClearInterval = globalThis.clearInterval
        let intervalCallback: (() => void) | null = null
        let intervalDelay: number | undefined
        let clearCalls = 0
        let activeSocket: WebSocket | null = null

        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
        globalThis.setInterval = ((handler: () => void, delay?: number) => {
            intervalCallback = handler
            intervalDelay = delay
            return 1 as unknown as ReturnType<typeof setInterval>
        }) as typeof setInterval
        globalThis.clearInterval = (() => {
            clearCalls += 1
        }) as typeof clearInterval

        try {
            const controller = createPairingBridgeSignalSocketController({
                pairing: createPairing(),
                isDisposed: () => false,
                isSuppressed: () => false,
                getChannel: () => ({ readyState: 'open' }) as RTCDataChannel,
                getPeer: () => null,
                getPairingSnapshot: () => createPairing().pairing,
                setSocket: (socket) => {
                    activeSocket = socket
                },
                getSocket: () => activeSocket,
                setBridgeState: () => undefined,
                scheduleReconnect: () => undefined,
                closeTransport: () => undefined,
                ensureOffer: async () => undefined,
                rebuildTransport: () => undefined,
                tryIceRestart: () => false,
                getGuestTransportId: () => null,
                setGuestTransportId: () => undefined,
                resetOfferState: () => undefined,
                schedulePeerRecovery: () => undefined,
                reportAsyncError: () => undefined,
                addRemoteCandidate: async () => undefined,
                flushRemoteCandidates: async () => undefined,
            })

            controller.open()
            const socket = FakeWebSocket.instances[0]
            socket?.open()
            intervalCallback?.()
            socket?.close()
            intervalCallback?.()

            expect(intervalDelay).toBe(PAIRING_SIGNAL_PING_INTERVAL_MS)
            expect(
                socket?.sent.map((payload) => JSON.parse(payload) as { type: string }).map((signal) => signal.type)
            ).toEqual(['join', 'ping'])
            expect(clearCalls).toBeGreaterThan(0)
        } finally {
            globalThis.WebSocket = originalWebSocket
            globalThis.setInterval = originalSetInterval
            globalThis.clearInterval = originalClearInterval
            FakeWebSocket.instances = []
        }
    })
})
