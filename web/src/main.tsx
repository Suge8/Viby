import './index.css'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { createAppElement } from './app-bootstrap'
import { initializeFontScale } from '@/hooks/useFontScale'
import { finalizeBootShell, reloadWindowForRecovery } from '@/lib/appRecovery'
import { installVitePreloadErrorHandler } from '@/lib/installVitePreloadErrorHandler'
import { publishRuntimeUpdateReady } from '@/lib/runtimeUpdateChannel'
import {
    clearRuntimeAssetRecoveryMarker,
    disableServiceWorkerForCurrentOrigin,
    invalidateRuntimeAssetsForBuild,
    shouldRegisterServiceWorkerForOrigin
} from '@/lib/runtimeAssetRecovery'

const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000
const APP_ROOT_ELEMENT_ID = 'root'

function renderApplication(rootElement: HTMLElement): void {
    createRoot(rootElement).render(createAppElement())
    clearRuntimeAssetRecoveryMarker()
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            finalizeBootShell()
        })
    })
}

async function bootstrap(): Promise<void> {
    initializeFontScale()
    const currentOrigin = window.location.origin

    const shouldReloadAfterServiceWorkerReset = await disableServiceWorkerForCurrentOrigin()
    if (shouldReloadAfterServiceWorkerReset) {
        reloadWindowForRecovery('local-service-worker-reset')
        return
    }

    if (import.meta.env.PROD) {
        installVitePreloadErrorHandler()
        await invalidateRuntimeAssetsForBuild(__APP_BUILD_ID__)
    }

    if (import.meta.env.PROD && shouldRegisterServiceWorkerForOrigin(currentOrigin)) {
        const updateSW = registerSW({
            immediate: true,
            onNeedRefresh() {
                publishRuntimeUpdateReady(async () => {
                    await updateSW(true)
                })
            },
            onOfflineReady() {
                console.log('App ready for offline use')
            },
            onRegistered(registration) {
                if (registration) {
                    setInterval(() => {
                        registration.update()
                    }, SERVICE_WORKER_UPDATE_INTERVAL_MS)
                }
            },
            onRegisterError(error) {
                console.error('SW registration error:', error)
            }
        })
    }

    const rootElement = document.getElementById(APP_ROOT_ELEMENT_ID)
    if (!rootElement) {
        throw new Error(`Missing #${APP_ROOT_ELEMENT_ID} root element`)
    }

    renderApplication(rootElement)
}

void bootstrap()
