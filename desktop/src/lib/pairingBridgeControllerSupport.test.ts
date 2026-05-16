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
        onChannelOpen: mock(() => undefined),
        onChannelActive: mock(() => undefined),
        onChannelClosed: mock(() => undefined),
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
        const onChannelOpen = mock(() => undefined)
        attach(channel, { startEventStream, onChannelOpen })
        channel.emit('open')
        expect(onChannelOpen).toHaveBeenCalled()
        expect(startEventStream).toHaveBeenCalled()
    })

    it('closes terminals on channel close', () => {
        const channel = new FakeDataChannel()
        const stopEventStream = mock(() => undefined)
        const closeAllTerminals = mock(() => undefined)
        const onChannelClosed = mock(() => undefined)
        attach(channel, {
            getClient: () => ({ closeAllTerminals, acceptUploadChunk: mock(async () => false) }) as never,
            stopEventStream,
            onChannelClosed,
        })
        channel.emit('close')
        expect(stopEventStream).toHaveBeenCalled()
        expect(closeAllTerminals).toHaveBeenCalled()
        expect(onChannelClosed).toHaveBeenCalled()
    })

    it('does not report channel close after disposal', () => {
        const channel = new FakeDataChannel()
        const onChannelClosed = mock(() => undefined)
        attach(channel, {
            isDisposed: () => true,
            onChannelClosed,
        })
        channel.emit('close')
        expect(onChannelClosed).not.toHaveBeenCalled()
    })

    it('echoes heartbeat frames and marks channel active', () => {
        const channel = new FakeDataChannel()
        const onChannelActive = mock(() => undefined)
        attach(channel, { onChannelActive })
        channel.emit('message', JSON.stringify({ kind: 'heartbeat', at: 1 }))
        expect(channel.sent).toHaveLength(1)
        expect(onChannelActive).toHaveBeenCalled()
    })

    it('marks business frames active before RPC handling', async () => {
        const channel = new FakeDataChannel()
        const onChannelActive = mock(() => undefined)
        const listSessions = mock(async () => [])
        attach(channel, {
            onChannelActive,
            getClient: () =>
                ({
                    listSessions,
                    closeAllTerminals: mock(() => undefined),
                    acceptUploadChunk: mock(async () => false),
                }) as never,
        })
        channel.emit('message', JSON.stringify({ kind: 'request', id: 'r1', method: 'sessions.list', params: {} }))
        await Promise.resolve()
        expect(onChannelActive).toHaveBeenCalled()
        expect(listSessions).toHaveBeenCalled()
    })

    it('keeps malformed frames out of channel active state', async () => {
        const channel = new FakeDataChannel()
        const onChannelActive = mock(() => undefined)
        attach(channel, { onChannelActive })
        channel.emit('message', 'not-json')
        await Promise.resolve()
        expect(onChannelActive).not.toHaveBeenCalled()
        expect(JSON.parse(channel.sent[0] ?? '{}')).toMatchObject({
            kind: 'response',
            ok: false,
            error: { code: 'pairing_peer_invalid_request' },
        })
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
