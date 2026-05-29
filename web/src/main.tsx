import './index.css'
import { createRoot } from 'react-dom/client'
import { initializeFontScale } from '@/hooks/useFontScale'
import { reloadWindowForRecovery } from '@/lib/appRecovery'
import { resolveInitialLocale } from '@/lib/i18n-context'
import { preloadTranslations } from '@/lib/i18nCatalog'
import { installVitePreloadErrorHandler } from '@/lib/installVitePreloadErrorHandler'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'
import { isPairingBootServiceWorkerBypassPath, shouldRegisterServiceWorkerForLocation } from '@/lib/runtimeAssetPolicy'
import {
    clearRuntimeAssetRecoveryMarker,
    disableServiceWorkerForCurrentOrigin,
    publishRuntimeUpdateForBuild,
} from '@/lib/runtimeAssetRecovery'
import { reportWebRuntimeWarning } from '@/lib/runtimeDiagnostics'
import { preloadAppCacheRuntime } from '@/lib/storage/preloadAppCacheRuntime'
import { createAppElement } from './app-bootstrap'

const APP_ROOT_ELEMENT_ID = 'root'

function renderApplication(rootElement: HTMLElement): void {
    createRoot(rootElement).render(createAppElement())
    clearRuntimeAssetRecoveryMarker()
}

function isPairingServiceWorkerResetPending(): boolean {
    return Boolean(
        (window as unknown as { __vibyPairingServiceWorkerResetPending?: boolean })
            .__vibyPairingServiceWorkerResetPending
    )
}

function warmRecoverableAppCache(): void {
    void preloadAppCacheRuntime().catch((error) => {
        reportWebRuntimeWarning('app cache warm preload failed', {
            message: error instanceof Error ? error.message : String(error),
        })
    })
}

async function bootstrap(): Promise<void> {
    if (isPairingServiceWorkerResetPending()) return
    initializeFontScale()
    ensureAppOverlayRoot()
    const currentOrigin = window.location.origin
    const isPairingBootPath = isPairingBootServiceWorkerBypassPath(window.location.pathname)
    const shouldUseServiceWorker =
        import.meta.env.PROD && shouldRegisterServiceWorkerForLocation(currentOrigin, window.location.pathname)
    const shouldReloadAfterServiceWorkerReset = await disableServiceWorkerForCurrentOrigin({
        clearCaches: !isPairingBootPath,
        keepServiceWorker: shouldUseServiceWorker,
    })
    if (shouldReloadAfterServiceWorkerReset) {
        reloadWindowForRecovery('local-service-worker-reset')
        return
    }

    await preloadTranslations(resolveInitialLocale())

    if (import.meta.env.PROD) {
        installVitePreloadErrorHandler()
        if (shouldUseServiceWorker) {
            publishRuntimeUpdateForBuild(__APP_BUILD_ID__)
        }
    }

    const rootElement = document.getElementById(APP_ROOT_ELEMENT_ID)
    if (!rootElement) {
        throw new Error(`Missing #${APP_ROOT_ELEMENT_ID} root element`)
    }

    renderApplication(rootElement)
    warmRecoverableAppCache()

    if (import.meta.env.PROD && shouldUseServiceWorker) {
        const { scheduleRuntimeServiceWorkerRegistration } = await import('@/boot/registerRuntimeServiceWorker')
        scheduleRuntimeServiceWorkerRegistration()
    }
}

void bootstrap()
