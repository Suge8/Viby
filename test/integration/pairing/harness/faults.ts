import type { VirtualClock } from './virtualClock'

export interface FaultMessage {
    data: string
    direction: string
    sequence: number
}

export interface FaultProfile {
    drop?: (message: FaultMessage) => boolean
    delayMs?: number | ((message: FaultMessage) => number)
    duplicate?: boolean | ((message: FaultMessage) => boolean)
    backpressure?: (message: FaultMessage) => boolean
}

export function noFaults(): FaultProfile {
    return {}
}

export function fixedDelay(delayMs: number): FaultProfile {
    return { delayMs }
}

export function dropEvery(interval: number): FaultProfile {
    return {
        drop: (message) => interval > 0 && message.sequence % interval === 0,
    }
}

export function duplicateEvery(interval: number): FaultProfile {
    return {
        duplicate: (message) => interval > 0 && message.sequence % interval === 0,
    }
}

export function resolveFaultDelay(profile: FaultProfile | undefined, message: FaultMessage): number {
    const delay = profile?.delayMs
    if (typeof delay === 'function') return Math.max(0, delay(message))
    return Math.max(0, delay ?? 0)
}

export function shouldDuplicate(profile: FaultProfile | undefined, message: FaultMessage): boolean {
    const duplicate = profile?.duplicate
    return typeof duplicate === 'function' ? duplicate(message) : duplicate === true
}

export function createBlackholeFault(): FaultProfile {
    return { drop: () => true }
}

export function scheduleFaultDelivery(clock: VirtualClock, delayMs: number, deliver: () => void): void {
    clock.setTimeout(deliver, delayMs)
}
