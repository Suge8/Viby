import { subscribeBrowserLifecycle } from '@/lib/browserLifecycle'

export type ForegroundPulseReason = 'focus' | 'visible' | 'resume' | 'pageshow-restored'

export type ForegroundPulse = {
    at: number
    reason: ForegroundPulseReason
}

type ForegroundPulseListener = (pulse: ForegroundPulse) => void

const FOREGROUND_PULSE_DEDUP_MS = 250

const listeners = new Set<ForegroundPulseListener>()
let unsubscribeBrowserLifecycle: (() => void) | null = null
let lastPulseAt = 0
let lastPulseReason: ForegroundPulseReason | null = null

function emitForegroundPulse(reason: ForegroundPulseReason): void {
    const now = Date.now()
    if (lastPulseReason !== null && now - lastPulseAt < FOREGROUND_PULSE_DEDUP_MS) {
        return
    }

    lastPulseAt = now
    lastPulseReason = reason
    const pulse: ForegroundPulse = {
        at: now,
        reason,
    }

    for (const listener of listeners) {
        listener(pulse)
    }
}

function installForegroundPulseListeners(): void {
    if (unsubscribeBrowserLifecycle) {
        return
    }

    unsubscribeBrowserLifecycle = subscribeBrowserLifecycle((event) => {
        if (event.kind === 'focus-visible') {
            emitForegroundPulse('focus')
            return
        }
        if (event.kind === 'visibility-visible') {
            emitForegroundPulse('visible')
            return
        }
        if (event.kind === 'resume-visible') {
            emitForegroundPulse('resume')
            return
        }
        if (event.kind === 'pageshow-restored') {
            emitForegroundPulse('pageshow-restored')
        }
    })
}

export function subscribeForegroundPulse(listener: ForegroundPulseListener): () => void {
    listeners.add(listener)
    installForegroundPulseListeners()
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && unsubscribeBrowserLifecycle) {
            unsubscribeBrowserLifecycle()
            unsubscribeBrowserLifecycle = null
        }
    }
}

export function resetForegroundPulseForTests(): void {
    listeners.clear()
    if (unsubscribeBrowserLifecycle) {
        unsubscribeBrowserLifecycle()
        unsubscribeBrowserLifecycle = null
    }
    lastPulseAt = 0
    lastPulseReason = null
}
