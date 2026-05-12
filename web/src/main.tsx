import './index.css'
import { createRoot } from 'react-dom/client'
import { initializeFontScale } from '@/hooks/useFontScale'
import { reloadWindowForRecovery } from '@/lib/appRecovery'
import { resolveInitialLocale } from '@/lib/i18n-context'
import { preloadTranslations } from '@/lib/i18nCatalog'
import { installVitePreloadErrorHandler } from '@/lib/installVitePreloadErrorHandler'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'
import { shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetPolicy'
import {
    clearRuntimeAssetRecoveryMarker,
    disableServiceWorkerForCurrentOrigin,
    publishRuntimeUpdateForBuild,
} from '@/lib/runtimeAssetRecovery'
import { preloadAppCacheRuntime } from '@/lib/storage/preloadAppCacheRuntime'
import { createAppElement } from './app-bootstrap'

const APP_ROOT_ELEMENT_ID = 'root'

function renderApplication(rootElement: HTMLElement): void {
    createRoot(rootElement).render(createAppElement())
    clearRuntimeAssetRecoveryMarker()
}

async function bootstrap(): Promise<void> {
    initializeFontScale()
    ensureAppOverlayRoot()
    const currentOrigin = window.location.origin
    const shouldUseServiceWorker = import.meta.env.PROD && shouldRegisterServiceWorkerForOrigin(currentOrigin)
    await preloadTranslations(resolveInitialLocale())
    await preloadAppCacheRuntime()

    const shouldReloadAfterServiceWorkerReset = await disableServiceWorkerForCurrentOrigin({
        keepServiceWorker: shouldUseServiceWorker,
    })
    if (shouldReloadAfterServiceWorkerReset) {
        reloadWindowForRecovery('local-service-worker-reset')
        return
    }

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

    if (import.meta.env.PROD && shouldUseServiceWorker) {
        const { scheduleRuntimeServiceWorkerRegistration } = await import('@/boot/registerRuntimeServiceWorker')
        scheduleRuntimeServiceWorkerRegistration()
    }
}

void bootstrap()
