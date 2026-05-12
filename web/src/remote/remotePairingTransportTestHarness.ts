type FakeTransportEvent = Event | MessageEvent | RTCDataChannelEvent
type ListenerMap = Map<string, Set<(event: FakeTransportEvent) => void>>

class FakeEventTarget {
    private readonly listeners: ListenerMap = new Map()

    addEventListener(type: string, listener: (event: FakeTransportEvent) => void): void {
        const listeners = this.listeners.get(type) ?? new Set()
        listeners.add(listener)
        this.listeners.set(type, listeners)
    }

    emit(type: string, event: FakeTransportEvent = new Event(type)): void {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event)
        }
    }
}

export class FakeWebSocket extends FakeEventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static instances: FakeWebSocket[] = []

    readonly sent: string[] = []
    readyState = 0

    constructor(readonly url: string) {
        super()
        FakeWebSocket.instances.push(this)
    }

    send(payload: string): void {
        this.sent.push(payload)
    }

    open(): void {
        this.readyState = FakeWebSocket.OPEN
        this.emit('open')
    }

    receive(payload: unknown): void {
        this.emit('message', new MessageEvent('message', { data: JSON.stringify(payload) }))
    }

    close(): void {
        this.readyState = 3
        this.emit('close')
    }

    markClosedSilently(): void {
        this.readyState = 3
    }
}

export class FakeDataChannel extends FakeEventTarget {
    readonly sent: string[] = []
    sendError: Error | null = null
    readyState: RTCDataChannelState = 'connecting'

    send(payload: string): void {
        if (this.sendError) {
            throw this.sendError
        }
        this.sent.push(payload)
    }

    close(): void {
        this.readyState = 'closed'
        this.emit('close')
    }

    open(): void {
        this.readyState = 'open'
        this.emit('open')
    }
}

export class FakePeerConnection extends FakeEventTarget {
    static instance: FakePeerConnection | null = null

    connectionState: RTCPeerConnectionState = 'new'
    signalingState: RTCSignalingState = 'stable'
    remoteDescription: RTCSessionDescription | null = null
    iceRestartCount = 0

    constructor() {
        super()
        FakePeerConnection.instance = this
    }

    restartIce(): void {
        this.iceRestartCount += 1
    }

    async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.remoteDescription = description as RTCSessionDescription
        this.signalingState = 'have-remote-offer'
    }

    async createAnswer(): Promise<RTCSessionDescriptionInit> {
        return { type: 'answer', sdp: 'answer-sdp' }
    }

    async setLocalDescription(): Promise<void> {
        this.signalingState = 'stable'
    }

    async addIceCandidate(): Promise<void> {}

    close(): void {
        this.connectionState = 'closed'
    }

    setConnectionState(state: RTCPeerConnectionState): void {
        this.connectionState = state
        this.emit('connectionstatechange')
    }

    attachChannel(channel: FakeDataChannel): void {
        this.emit('datachannel', { channel } as unknown as RTCDataChannelEvent)
    }
}

export function resetFakeRemoteTransport(): void {
    FakeWebSocket.instances = []
    FakePeerConnection.instance = null
}
