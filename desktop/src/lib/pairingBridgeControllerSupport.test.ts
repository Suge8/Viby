import { describe, expect, it, mock } from 'bun:test'
import { attachPairingDataChannel, HubPausedError } from './pairingBridgeControllerSupport'

type Listener = (event?: { data: unknown }) => void

class FakeDataChannel {
    readyState: RTCDataChannelState = 'open'
    sent: string[] = []
    private readonly listeners = new Map<string, Listener[]>()
    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }
    send(data: string): void {
        this.sent.push(data)
    }
    emit(type: string, data?: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener({ data })
    }
}

function attach(channel: FakeDataChannel, overrides: Record<string, unknown> = {}) {
    attachPairingDataChannel({
        channel: channel as unknown as RTCDataChannel,
        getClient: () =>
            ({ closeAllTerminals: mock(() => undefined), acceptUploadChunk: mock(async () => false) }) as never,
        isDisposed: () => false,
        setBridgeState: mock(() => undefined),
        stopEventStream: mock(() => undefined),
        startEventStream: mock(async () => undefined),
        reportAsyncError: mock(() => undefined),
        ...overrides,
    })
}

describe('pairingBridgeControllerSupport', () => {
    it('starts the event stream on channel open', () => {
        const channel = new FakeDataChannel()
        const startEventStream = mock(async () => undefined)
        attach(channel, { startEventStream })
        channel.emit('open')
        expect(startEventStream).toHaveBeenCalled()
    })

    it('closes terminals on channel close', () => {
        const channel = new FakeDataChannel()
        const stopEventStream = mock(() => undefined)
        const closeAllTerminals = mock(() => undefined)
        attach(channel, {
            getClient: () => ({ closeAllTerminals, acceptUploadChunk: mock(async () => false) }) as never,
            stopEventStream,
        })
        channel.emit('close')
        expect(stopEventStream).toHaveBeenCalled()
        expect(closeAllTerminals).toHaveBeenCalled()
    })

    it('echoes heartbeat frames and marks ready', () => {
        const channel = new FakeDataChannel()
        const setBridgeState = mock(() => undefined)
        attach(channel, { setBridgeState })
        channel.emit('message', JSON.stringify({ kind: 'heartbeat', at: 1 }))
        expect(channel.sent).toHaveLength(1)
        expect(setBridgeState).toHaveBeenCalledWith({ phase: 'ready', message: '已连接' })
    })

    it('returns hub_paused when Hub is unavailable during RPC', async () => {
        const channel = new FakeDataChannel()
        attach(channel, {
            getClient: () => {
                throw new HubPausedError()
            },
        })
        channel.emit('message', JSON.stringify({ kind: 'request', id: 'r1', method: 'sessions.list', params: {} }))
        await Promise.resolve()
        expect(JSON.parse(channel.sent[0] ?? '{}')).toMatchObject({
            kind: 'response',
            id: 'r1',
            ok: false,
            error: { code: 'hub_paused' },
        })
    })
})
