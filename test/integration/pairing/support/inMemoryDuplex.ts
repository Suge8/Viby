import type { PairingSocket } from '../../../../shared/src/pairing/pairingTransport'
import type { FaultProfile } from './faults'
import { resolveFaultDelay, scheduleFaultDelivery, shouldDuplicate } from './faults'
import type { VirtualClock } from './virtualClock'

export const DUPLEX_CONNECTING = 0
export const DUPLEX_OPEN = 1
export const DUPLEX_CLOSING = 2
export const DUPLEX_CLOSED = 3

export interface DuplexCloseEvent {
    code: number
    reason: string
}

export interface InMemoryDuplexEndpoint extends PairingSocket {
    readonly label: string
    readonly sent: string[]
    readonly delivered: string[]
    /** Broker-compatible close that propagates the code to both ends. */
    close(code?: number, reason?: string): void
    open(): void
    suspend(): void
    resume(): void
    isSuspended(): boolean
}

class DuplexEndpoint implements InMemoryDuplexEndpoint {
    readyState = DUPLEX_CONNECTING
    onopen: (() => void) | null = null
    onclose: ((event?: DuplexCloseEvent) => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    readonly sent: string[] = []
    readonly delivered: string[] = []
    peer: DuplexEndpoint | null = null
    private suspended = false
    private sequence = 0

    constructor(
        private readonly clock: VirtualClock,
        readonly label: string,
        private readonly fault?: FaultProfile
    ) {}

    open(): void {
        if (this.readyState !== DUPLEX_CONNECTING) return
        this.readyState = DUPLEX_OPEN
        this.onopen?.()
    }

    send(data: string): void {
        if (this.readyState !== DUPLEX_OPEN) {
            throw new Error(`Cannot send on ${this.label}: socket is not open`)
        }
        const peer = this.peer
        if (!peer) throw new Error(`Cannot send on ${this.label}: peer is not attached`)
        this.sent.push(data)
        const message = { data, direction: `${this.label}->${peer.label}`, sequence: ++this.sequence }
        if (this.fault?.backpressure?.(message)) throw new Error(`Backpressure on ${message.direction}`)
        if (this.suspended || this.fault?.drop?.(message)) return
        const delayMs = resolveFaultDelay(this.fault, message)
        const deliver = () => peer.receiveFromPeer(data)
        scheduleFaultDelivery(this.clock, delayMs, deliver)
        if (shouldDuplicate(this.fault, message)) scheduleFaultDelivery(this.clock, delayMs, deliver)
    }

    close(code?: number, reason?: string): void {
        const event = code === undefined ? undefined : { code, reason: reason ?? '' }
        this.closeLocal(event)
        this.peer?.closeLocal(event)
    }

    suspend(): void {
        this.suspended = true
    }

    resume(): void {
        this.suspended = false
    }

    isSuspended(): boolean {
        return this.suspended
    }

    private receiveFromPeer(data: string): void {
        if (this.readyState !== DUPLEX_OPEN || this.suspended) return
        this.delivered.push(data)
        this.onmessage?.({ data })
    }

    private closeLocal(event?: DuplexCloseEvent): void {
        if (this.readyState === DUPLEX_CLOSED) return
        this.readyState = DUPLEX_CLOSED
        this.onclose?.(event)
    }
}

export function createDuplexPair(
    clock: VirtualClock,
    options: { leftLabel?: string; rightLabel?: string; fault?: FaultProfile } = {}
): readonly [InMemoryDuplexEndpoint, InMemoryDuplexEndpoint] {
    const left = new DuplexEndpoint(clock, options.leftLabel ?? 'left', options.fault)
    const right = new DuplexEndpoint(clock, options.rightLabel ?? 'right', options.fault)
    left.peer = right
    right.peer = left
    return [left, right]
}
