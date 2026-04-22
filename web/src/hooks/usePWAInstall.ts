import { useEffect, useState } from 'react'
import { useStandaloneDisplayMode } from '@/hooks/useStandaloneDisplayMode'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallState = 'idle' | 'available' | 'installing' | 'installed'
export type InstallPlatform = 'ios' | 'native' | null
export type PWAInstallState = {
    installPlatform: InstallPlatform
    isStandalone: boolean
    promptInstall: () => Promise<boolean>
    dismissInstall: () => void
}

const INSTALL_DISMISSED_KEY = LOCAL_STORAGE_KEYS.installDismissed
const INSTALL_DISMISSED_VALUE = 'true'

export function isIOSSafariBrowser(): boolean {
    if (typeof window === 'undefined') return false
    const ua = window.navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua)
    const isWebkit = /WebKit/.test(ua)
    const isChrome = /CriOS/.test(ua)
    const isFirefox = /FxiOS/.test(ua)
    // iOS Safari is WebKit-based but not Chrome or Firefox
    return isIOS && isWebkit && !isChrome && !isFirefox
}

function getInstallDismissed(): boolean {
    return readBrowserStorageItem('local', INSTALL_DISMISSED_KEY) === INSTALL_DISMISSED_VALUE
}

function setInstallDismissed(): void {
    writeBrowserStorageItem('local', INSTALL_DISMISSED_KEY, INSTALL_DISMISSED_VALUE)
}

function resolveInstallPlatform(options: {
    dismissed: boolean
    installState: InstallState
    isIOS: boolean
    isStandalone: boolean
}): InstallPlatform {
    if (options.dismissed || options.isStandalone) {
        return null
    }

    if (options.isIOS) {
        return 'ios'
    }

    return options.installState === 'available' ? 'native' : null
}

export function usePWAInstall(): PWAInstallState {
    const [installState, setInstallState] = useState<InstallState>('idle')
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [dismissed, setDismissed] = useState(() => getInstallDismissed())

    const isIOS = typeof window !== 'undefined' && isIOSSafariBrowser()
    const isStandalone = useStandaloneDisplayMode()

    useEffect(() => {
        if (isStandalone) {
            setInstallState('installed')
            return
        }

        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
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
    }, [isStandalone])

    async function promptInstall(): Promise<boolean> {
        if (!deferredPrompt) {
            return false
        }

        // Clear immediately to prevent re-entrancy while userChoice is pending
        const prompt = deferredPrompt
        setDeferredPrompt(null)
        setInstallState('installing')

        try {
            await prompt.prompt()
            const { outcome } = await prompt.userChoice

            if (outcome === 'accepted') {
                setInstallState('installed')
                return true
            } else {
                // User dismissed, wait for a new beforeinstallprompt event
                setInstallState('idle')
                return false
            }
        } catch {
            setInstallState('idle')
            return false
        }
    }

    function dismissInstall(): void {
        setDismissed(true)
        setInstallDismissed()
    }

    const installPlatform = resolveInstallPlatform({
        dismissed,
        installState,
        isIOS,
        isStandalone,
    })

    return {
        installPlatform,
        isStandalone,
        promptInstall,
        dismissInstall,
    }
}
