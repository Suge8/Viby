import { describe, expect, it, mock } from 'bun:test'
import { attachPairingDataChannel } from './pairingBridgeControllerSupport'

type Listener = (event?: { data: unknown }) => void

class FakeDataChannel {
    readyState: RTCDataChannelState = 'open'
    sent: string[] = []
    private readonly listeners = new Map<string, Listener[]>()
    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }
    send(data: string): void { this.sent.push(data) }
    emit(type: string, data?: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener({ data })
    }
}

function attach(channel: FakeDataChannel, overrides: Record<string, unknown> = {}) {
    attachPairingDataChannel({
        channel: channel as unknown as RTCDataChannel,
        client: { closeAllTerminals: mock(() => undefined), acceptUploadChunk: mock(async () => false) } as never,
        isDisposed: () => false,
        setBridgeState: mock(() => undefined),
        stopEventStream: mock(() => undefined),
        startEventStream: mock(async () => undefined),
        reportPairingPresence: mock(() => undefined),
        reportAsyncError: mock(() => undefined),
        ...overrides,
    })
}

describe('pairingBridgeControllerSupport', () => {
    it('reports presence and starts the event stream on channel open', () => {
        const channel = new FakeDataChannel()
        const reportPairingPresence = mock(() => undefined)
        const startEventStream = mock(async () => undefined)
        attach(channel, { reportPairingPresence, startEventStream })
        channel.emit('open')
        expect(reportPairingPresence).toHaveBeenCalledWith(true)
        expect(startEventStream).toHaveBeenCalled()
    })

    it('keeps presence alive and closes terminals on channel close', () => {
        const channel = new FakeDataChannel()
        const stopEventStream = mock(() => undefined)
        const closeAllTerminals = mock(() => undefined)
        const reportPairingPresence = mock(() => undefined)
        attach(channel, { client: { closeAllTerminals, acceptUploadChunk: mock(async () => false) }, stopEventStream, reportPairingPresence })
        channel.emit('close')
        expect(stopEventStream).toHaveBeenCalled()
        expect(closeAllTerminals).toHaveBeenCalled()
        expect(reportPairingPresence).toHaveBeenCalledWith(true)
    })

    it('echoes heartbeat frames and marks ready', () => {
        const channel = new FakeDataChannel()
        const setBridgeState = mock(() => undefined)
        attach(channel, { setBridgeState })
        channel.emit('message', JSON.stringify({ kind: 'heartbeat', at: 1 }))
        expect(channel.sent).toHaveLength(1)
        expect(setBridgeState).toHaveBeenCalledWith({ phase: 'ready', message: '已连接' })
    })
})
