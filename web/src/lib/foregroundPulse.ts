import { type BrowserRecoveryForegroundReason, subscribeBrowserRecoveryIntent } from '@/lib/browserRecoveryIntent'

export type ForegroundPulseReason = BrowserRecoveryForegroundReason

export type ForegroundPulse = {
    at: number
    reason: ForegroundPulseReason
}

type ForegroundPulseListener = (pulse: ForegroundPulse) => void

export function subscribeForegroundPulse(listener: ForegroundPulseListener): () => void {
    return subscribeBrowserRecoveryIntent((intent) => {
        if (intent.kind !== 'foreground' || !intent.reason) return
        listener({ at: intent.at, reason: intent.reason })
    })
}

export { resetBrowserRecoveryIntentForTests as resetForegroundPulseForTests } from '@/lib/browserRecoveryIntent'
