export type BrowserLifecycleEventKind =
    | 'focus-visible'
    | 'visibility-visible'
    | 'visibility-hidden'
    | 'resume-visible'
    | 'pageshow-restored'
    | 'pagehide'
    | 'freeze'
    | 'network-online'
    | 'network-offline'
    | 'network-change'

export type BrowserLifecycleEvent = Readonly<{
    at: number
    kind: BrowserLifecycleEventKind
}>

type BrowserLifecycleListener = (event: BrowserLifecycleEvent) => void

const listeners = new Set<BrowserLifecycleListener>()
let uninstallBrowserLifecycleListeners: (() => void) | null = null

function canUseBrowserLifecycle(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
}

type NetworkConnectionLike = EventTarget & {
    readonly effectiveType?: string
    readonly type?: string
}

function getNetworkConnection(): NetworkConnectionLike | null {
    if (typeof navigator === 'undefined') return null
    const nav = navigator as Navigator & {
        connection?: NetworkConnectionLike
        mozConnection?: NetworkConnectionLike
        webkitConnection?: NetworkConnectionLike
    }
    return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null
}

function readConnectionSignature(connection: NetworkConnectionLike | null): string | null {
    if (!connection) return null
    return connection.type ?? connection.effectiveType ?? null
}

function isDocumentVisible(): boolean {
    return canUseBrowserLifecycle() && document.visibilityState === 'visible'
}

function emitBrowserLifecycleEvent(kind: BrowserLifecycleEventKind): void {
    const event: BrowserLifecycleEvent = {
        at: Date.now(),
        kind,
    }

    for (const listener of listeners) {
        listener(event)
    }
}

function installBrowserLifecycleListeners(): void {
    if (uninstallBrowserLifecycleListeners || !canUseBrowserLifecycle()) {
        return
    }

    const handleFocus = (): void => {
        if (!isDocumentVisible()) {
            return
        }

        emitBrowserLifecycleEvent('focus-visible')
    }

    const handleVisibilityChange = (): void => {
        emitBrowserLifecycleEvent(document.visibilityState === 'visible' ? 'visibility-visible' : 'visibility-hidden')
    }

    const handlePageShow = (event: PageTransitionEvent): void => {
        if (!event.persisted) {
            return
        }

        emitBrowserLifecycleEvent('pageshow-restored')
    }
    const handleResume = (): void => {
        if (!isDocumentVisible()) {
            return
        }

        emitBrowserLifecycleEvent('resume-visible')
    }

    const handlePageHide = (): void => {
        emitBrowserLifecycleEvent('pagehide')
    }

    const handleFreeze = (): void => {
        emitBrowserLifecycleEvent('freeze')
    }

    const handleOnline = (): void => {
        emitBrowserLifecycleEvent('network-online')
    }

    const handleOffline = (): void => {
        emitBrowserLifecycleEvent('network-offline')
    }

    const networkConnection = getNetworkConnection()
    let lastConnectionSignature = readConnectionSignature(networkConnection)
    const handleConnectionChange = (): void => {
        const nextSignature = readConnectionSignature(networkConnection)
        if (nextSignature !== lastConnectionSignature && lastConnectionSignature !== null) {
            emitBrowserLifecycleEvent('network-change')
        }
        lastConnectionSignature = nextSignature
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('resume', handleResume as EventListener)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('freeze', handleFreeze as EventListener)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    networkConnection?.addEventListener?.('change', handleConnectionChange)

    uninstallBrowserLifecycleListeners = () => {
        window.removeEventListener('focus', handleFocus)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        document.removeEventListener('resume', handleResume as EventListener)
        window.removeEventListener('pageshow', handlePageShow)
        window.removeEventListener('pagehide', handlePageHide)
        document.removeEventListener('freeze', handleFreeze as EventListener)
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        networkConnection?.removeEventListener?.('change', handleConnectionChange)
        uninstallBrowserLifecycleListeners = null
    }
}

function maybeUninstallBrowserLifecycleListeners(): void {
    if (listeners.size !== 0 || !uninstallBrowserLifecycleListeners) {
        return
    }

    uninstallBrowserLifecycleListeners()
}

export function subscribeBrowserLifecycle(listener: BrowserLifecycleListener): () => void {
    listeners.add(listener)
    installBrowserLifecycleListeners()

    return () => {
        listeners.delete(listener)
        maybeUninstallBrowserLifecycleListeners()
    }
}

export function resetBrowserLifecycleForTests(): void {
    listeners.clear()
    maybeUninstallBrowserLifecycleListeners()
}
