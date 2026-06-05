import { type BrowserLifecycleEvent, subscribeBrowserLifecycle } from '@/lib/browserLifecycle'

export type BrowserRecoveryIntentKind = 'foreground' | 'pagehide' | 'backgrounded' | 'online-changed'
export type BrowserRecoveryForegroundReason = 'focus' | 'visible' | 'resume' | 'pageshow-restored' | 'network'

export type BrowserRecoveryIntent = Readonly<{
    at: number
    kind: BrowserRecoveryIntentKind
    online: boolean
    reason?: BrowserRecoveryForegroundReason
}>

type BrowserRecoveryIntentListener = (intent: BrowserRecoveryIntent) => void

const FOREGROUND_INTENT_DEDUP_MS = 250
const listeners = new Set<BrowserRecoveryIntentListener>()
let unsubscribeBrowserLifecycle: (() => void) | null = null
let lastForegroundAt = 0
let lastForegroundReason: BrowserRecoveryForegroundReason | null = null
let onlineSnapshot = readOnlineSnapshot()

function readOnlineSnapshot(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine
}

function isDocumentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function emit(intent: BrowserRecoveryIntent): void {
    for (const listener of listeners) listener(intent)
}

function emitForeground(event: BrowserLifecycleEvent, reason: BrowserRecoveryForegroundReason): void {
    if (lastForegroundReason !== null && event.at - lastForegroundAt < FOREGROUND_INTENT_DEDUP_MS) return
    lastForegroundAt = event.at
    lastForegroundReason = reason
    emit({ at: event.at, kind: 'foreground', online: onlineSnapshot, reason })
}

function handleLifecycleEvent(event: BrowserLifecycleEvent): void {
    if (event.kind === 'network-online' || event.kind === 'network-offline' || event.kind === 'network-change') {
        onlineSnapshot = readOnlineSnapshot()
        emit({ at: event.at, kind: 'online-changed', online: onlineSnapshot })
        if (onlineSnapshot && isDocumentVisible()) emitForeground(event, 'network')
        return
    }
    if (event.kind === 'focus-visible') return emitForeground(event, 'focus')
    if (event.kind === 'visibility-visible') return emitForeground(event, 'visible')
    if (event.kind === 'resume-visible') return emitForeground(event, 'resume')
    if (event.kind === 'pageshow-restored') return emitForeground(event, 'pageshow-restored')
    if (event.kind === 'visibility-hidden') return emit({ at: event.at, kind: 'backgrounded', online: onlineSnapshot })
    if (event.kind === 'pagehide' || event.kind === 'freeze') {
        emit({ at: event.at, kind: 'pagehide', online: onlineSnapshot })
    }
}

function installBrowserRecoveryIntent(): void {
    if (unsubscribeBrowserLifecycle) return
    onlineSnapshot = readOnlineSnapshot()
    unsubscribeBrowserLifecycle = subscribeBrowserLifecycle(handleLifecycleEvent)
}

export function subscribeBrowserRecoveryIntent(listener: BrowserRecoveryIntentListener): () => void {
    listeners.add(listener)
    installBrowserRecoveryIntent()
    return () => {
        listeners.delete(listener)
        if (listeners.size !== 0 || !unsubscribeBrowserLifecycle) return
        unsubscribeBrowserLifecycle()
        unsubscribeBrowserLifecycle = null
        lastForegroundAt = 0
        lastForegroundReason = null
    }
}

export function getBrowserOnlineSnapshot(): boolean {
    onlineSnapshot = readOnlineSnapshot()
    return onlineSnapshot
}

export function resetBrowserRecoveryIntentForTests(): void {
    listeners.clear()
    unsubscribeBrowserLifecycle?.()
    unsubscribeBrowserLifecycle = null
    lastForegroundAt = 0
    lastForegroundReason = null
    onlineSnapshot = readOnlineSnapshot()
}
