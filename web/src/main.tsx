import './index.css'
import { createRoot } from 'react-dom/client'
import { createAppElement } from './app-bootstrap'
import { initializeFontScale } from '@/hooks/useFontScale'
import { resolveInitialLocale } from '@/lib/i18n-context'
import { preloadTranslations } from '@/lib/i18nCatalog'
import { reloadWindowForRecovery } from '@/lib/appRecovery'
import { installVitePreloadErrorHandler } from '@/lib/installVitePreloadErrorHandler'
import { shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetPolicy'
import {
    clearRuntimeAssetRecoveryMarker,
    disableServiceWorkerForCurrentOrigin,
    invalidateRuntimeAssetsForBuild
} from '@/lib/runtimeAssetRecovery'
const APP_ROOT_ELEMENT_ID = 'root'

function renderApplication(rootElement: HTMLElement): void {
    createRoot(rootElement).render(createAppElement())
    clearRuntimeAssetRecoveryMarker()
}

async function bootstrap(): Promise<void> {
    initializeFontScale()
    const currentOrigin = window.location.origin
    await preloadTranslations(resolveInitialLocale())

    const shouldReloadAfterServiceWorkerReset = await disableServiceWorkerForCurrentOrigin()
    if (shouldReloadAfterServiceWorkerReset) {
        reloadWindowForRecovery('local-service-worker-reset')
        return
    }

    if (import.meta.env.PROD) {
        installVitePreloadErrorHandler()
        await invalidateRuntimeAssetsForBuild(__APP_BUILD_ID__)
    }

    const rootElement = document.getElementById(APP_ROOT_ELEMENT_ID)
    if (!rootElement) {
        throw new Error(`Missing #${APP_ROOT_ELEMENT_ID} root element`)
    }

    renderApplication(rootElement)

    if (import.meta.env.PROD && shouldRegisterServiceWorkerForOrigin(currentOrigin)) {
        const { scheduleRuntimeServiceWorkerRegistration } = await import('@/boot/registerRuntimeServiceWorker')
        scheduleRuntimeServiceWorkerRegistration()
    }
}

void bootstrap()
