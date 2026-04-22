export type BrowserLifecycleEventKind =
    | 'focus-visible'
    | 'visibility-visible'
    | 'visibility-hidden'
    | 'resume-visible'
    | 'pageshow-restored'
    | 'pagehide'
    | 'freeze'

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

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('resume', handleResume as EventListener)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('freeze', handleFreeze as EventListener)

    uninstallBrowserLifecycleListeners = () => {
        window.removeEventListener('focus', handleFocus)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        document.removeEventListener('resume', handleResume as EventListener)
        window.removeEventListener('pageshow', handlePageShow)
        window.removeEventListener('pagehide', handlePageHide)
        document.removeEventListener('freeze', handleFreeze as EventListener)
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
