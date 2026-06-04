import { describe, expect, it } from 'bun:test'
import { startPairingRelayBridge } from '../../../desktop/src/lib/pairingRelayBridge'
import { createRemotePairingRelaySocket } from '../../../web/src/remote/remotePairingRelaySocket'
import { createVirtualClock } from './support/virtualClock'

class StormSocket {
    static readonly OPEN = 1
    onclose: ((event?: { code: number; reason: string }) => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    onopen: (() => void) | null = null
    readyState = StormSocket.OPEN
    readonly sent: string[] = []

    constructor(readonly url: string) {}

    close(): void {
        if (this.readyState === 3) return
        this.readyState = 3
        this.onclose?.({ code: 1000, reason: '' })
    }

    send(data: string): void {
        this.sent.push(data)
    }
}

describe('pairing reconnect storm', () => {
    it('decorrelates web and desktop relay reconnect timers with injected jitter', async () => {
        const clock = createVirtualClock(99)
        const phoneRandom = createVirtualClock(1).random
        const desktopRandom = createVirtualClock(2).random
        const phoneDelays: number[] = []
        const desktopDelays: number[] = []
        const phoneSockets: StormSocket[] = []
        const desktopSockets: StormSocket[] = []

        createRemotePairingRelaySocket({
            tunnelUrl: 'wss://pair.example/tunnel',
            onOpen: () => {},
            onClose: () => {},
            onFatal: () => {},
            onMessage: () => {},
            randomJitter: phoneRandom,
            scheduleTimeout: (callback, delayMs) => {
                phoneDelays.push(delayMs)
                return clock.setTimeout(callback, delayMs)
            },
            socketFactory: (url) => {
                const socket = new StormSocket(url)
                phoneSockets.push(socket)
                return socket
            },
        })
        startPairingRelayBridge({
            tunnelUrl: 'wss://pair.example/tunnel',
            getClient: () => ({ streamEvents: async () => {} }) as never,
            isDisposed: () => false,
            onActive: () => {},
            onClosed: () => {},
            onOpen: () => {},
            randomJitter: desktopRandom,
            reportAsyncError: () => {},
            scheduleInterval: (callback, intervalMs) => clock.setInterval(callback, intervalMs),
            scheduleTimeout: (callback, delayMs) => {
                desktopDelays.push(delayMs)
                return clock.setTimeout(callback, delayMs)
            },
            socketFactory: (url) => {
                const socket = new StormSocket(url)
                desktopSockets.push(socket)
                return socket
            },
        })

        phoneSockets[0].close()
        desktopSockets[0].close()

        expect(phoneDelays).toHaveLength(1)
        expect(desktopDelays).toHaveLength(1)
        expect(phoneDelays[0]).not.toBe(desktopDelays[0])

        const firstDelay = Math.min(phoneDelays[0], desktopDelays[0])
        const secondDelay = Math.max(phoneDelays[0], desktopDelays[0])
        await clock.advance(firstDelay)
        expect(phoneSockets.length + desktopSockets.length).toBe(3)

        await clock.advance(secondDelay - firstDelay)
        expect(phoneSockets).toHaveLength(2)
        expect(desktopSockets).toHaveLength(2)
    })
})
