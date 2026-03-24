import { registerSW } from 'virtual:pwa-register'
import { publishRuntimeUpdateReady } from '@/lib/runtimeUpdateChannel'

const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000

export async function registerRuntimeServiceWorker(): Promise<void> {
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

export function scheduleRuntimeServiceWorkerRegistration(): void {
    if (typeof window === 'undefined') {
        return
    }

    const register = () => {
        void registerRuntimeServiceWorker()
    }

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(register)
        return
    }

    globalThis.setTimeout(register, 0)
}
