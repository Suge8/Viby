import { useEffect, useRef, useState } from 'react'
import { useStandaloneDisplayMode } from '@/hooks/useStandaloneDisplayMode'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { isPotentiallyTrustworthyWebOrigin } from '@/lib/runtimeAssetPolicy'
import { SESSION_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallState = 'idle' | 'available' | 'installing' | 'installed'
export type InstallPlatform = 'desktop-safari' | 'ios' | 'native' | 'shortcut' | null
export type PWAInstallState = {
    installPlatform: InstallPlatform
    isStandalone: boolean
    promptInstall: () => Promise<boolean>
    dismissInstall: () => void
}

const INSTALL_DISMISSED_KEY = SESSION_STORAGE_KEYS.installDismissed
// Dismiss is intentionally session-scoped (cleared when the user closes the
// tab) so a fresh scan + workspace entry always re-offers the install banner.
// A previous build persisted dismiss across sessions for 3 days, but users
// expected the banner to come back on every new pairing entry and the long
// memory created the impression that PWA install was broken.

export function isIOSBrowser(): boolean {
    if (typeof window === 'undefined') return false
    const navigatorValue = window.navigator as Navigator & { maxTouchPoints?: number }
    return (
        /iPad|iPhone|iPod/.test(navigatorValue.userAgent) ||
        (navigatorValue.platform === 'MacIntel' && (navigatorValue.maxTouchPoints ?? 0) > 1)
    )
}

export function isDesktopSafariBrowser(): boolean {
    if (typeof window === 'undefined' || isIOSBrowser()) return false

    const userAgent = window.navigator.userAgent
    return (
        /Safari\//.test(userAgent) &&
        /Version\//.test(userAgent) &&
        !/Android|Chrome|Chromium|CriOS|Edg|FxiOS|OPR\//.test(userAgent)
    )
}

function getCurrentOrigin(): string {
    return typeof window === 'undefined' ? '' : window.location.origin
}

function readInstallDismissed(): boolean {
    return readBrowserStorageItem('session', INSTALL_DISMISSED_KEY) === '1'
}

function setInstallDismissed(): void {
    writeBrowserStorageItem('session', INSTALL_DISMISSED_KEY, '1')
}

export function resolveInstallPlatform(options: {
    dismissed: boolean
    installState: InstallState
    isDesktopSafari: boolean
    isIOS: boolean
    isStandalone: boolean
    origin: string
}): InstallPlatform {
    if (options.dismissed || options.isStandalone) {
        return null
    }

    if (options.installState === 'available' && !options.isIOS) {
        return 'native'
    }

    const hasFullPwaOrigin = isPotentiallyTrustworthyWebOrigin(options.origin)
    if (options.isIOS) {
        return hasFullPwaOrigin ? 'ios' : 'shortcut'
    }
    if (!hasFullPwaOrigin) {
        return 'shortcut'
    }

    return options.isDesktopSafari ? 'desktop-safari' : null
}

/**
 * Surfaces install platform detection and the native install prompt trigger.
 * The PWA handoff secret is owned upstream by the remote pairing surface (see
 * `useRemotePairingPwaHandoffWarmup`), so this hook never touches the manifest
 * itself — it only decides which install affordance to show.
 */
export function usePWAInstall(): PWAInstallState {
    const [installState, setInstallState] = useState<InstallState>('idle')
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [dismissed, setDismissed] = useState(readInstallDismissed)
    const installAttemptRef = useRef(false)

    const isIOS = isIOSBrowser()
    const isDesktopSafari = isDesktopSafariBrowser()
    const isStandalone = useStandaloneDisplayMode()

    useEffect(() => {
        if (isStandalone) {
            setInstallState('installed')
            return
        }

        const handleBeforeInstallPrompt = (event: Event) => {
            if (isIOS) return
            event.preventDefault()
            setDeferredPrompt(event as BeforeInstallPromptEvent)
            setInstallState('available')
        }

        const handleAppInstalled = () => {
            setInstallState('installed')
            setDeferredPrompt(null)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.addEventListener('appinstalled', handleAppInstalled)

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
            window.removeEventListener('appinstalled', handleAppInstalled)
        }
    }, [isIOS, isStandalone])

    const installPlatform = resolveInstallPlatform({
        dismissed,
        installState,
        isDesktopSafari,
        isIOS,
        isStandalone,
        origin: getCurrentOrigin(),
    })

    async function promptNativeInstall(): Promise<boolean> {
        if (installAttemptRef.current || !deferredPrompt) return false
        installAttemptRef.current = true
        try {
            const prompt = deferredPrompt
            setDeferredPrompt(null)
            setInstallState('installing')
            await prompt.prompt()
            const { outcome } = await prompt.userChoice
            if (outcome === 'accepted') {
                setInstallState('installed')
                return true
            }
            setInstallState('idle')
            return false
        } catch {
            setInstallState('idle')
            return false
        } finally {
            installAttemptRef.current = false
        }
    }

    async function promptGuideInstall(): Promise<boolean> {
        return true
    }

    function dismissInstall(): void {
        setDismissed(true)
        setInstallDismissed()
    }

    return {
        installPlatform,
        isStandalone,
        promptInstall: installPlatform === 'native' ? promptNativeInstall : promptGuideInstall,
        dismissInstall,
    }
}
