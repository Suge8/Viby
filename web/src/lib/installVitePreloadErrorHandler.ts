import { reloadWindowForRecovery } from '@/lib/appRecovery'
import { readPendingNavigationRecoveryHref } from '@/lib/navigationTransition'
import type { RuntimeAssetFailure } from '@/lib/runtimeAssetFailure'
import { recoverRuntimeAssets } from '@/lib/runtimeAssetRecovery'
import { publishRuntimeUpdateReady } from '@/lib/runtimeUpdateChannel'

type VitePreloadErrorEvent = Event & {
    payload?: unknown
}

const VITE_PRELOAD_ERROR_EVENT = 'vite:preloadError'
const VITE_PRELOAD_RECOVERY_REASON = 'vite:preloadError'

let hasInstalledVitePreloadErrorHandler = false

function extractRuntimeAssetFailure(payload: unknown): RuntimeAssetFailure {
    if (payload instanceof Error) {
        return {
            name: payload.name,
            message: payload.message,
            stack: payload.stack,
        }
    }

    if (!payload || typeof payload !== 'object') {
        return {
            message: typeof payload === 'string' ? payload : null,
        }
    }

    const candidate = payload as Record<string, unknown>
    return {
        name: typeof candidate.name === 'string' ? candidate.name : null,
        filename: typeof candidate.filename === 'string' ? candidate.filename : null,
        message: typeof candidate.message === 'string' ? candidate.message : null,
        stack: typeof candidate.stack === 'string' ? candidate.stack : null,
    }
}

export async function recoverFromVitePreloadError(payload?: unknown, reload?: () => void): Promise<boolean> {
    const failure = extractRuntimeAssetFailure(payload)
    const { isLikelyRuntimeAssetFailure } = await import('@/lib/runtimeAssetFailure')
    if (!isLikelyRuntimeAssetFailure(failure)) {
        console.error('Skipped runtime asset recovery for non-asset preload failure:', payload)
        return false
    }

    const recovered = await recoverRuntimeAssets(VITE_PRELOAD_RECOVERY_REASON)
    if (!recovered) {
        console.error(`Skipped repeated runtime asset recovery for ${VITE_PRELOAD_RECOVERY_REASON}`)
        return false
    }

    const resumeHref = readPendingNavigationRecoveryHref() ?? undefined
    if (reload) {
        publishRuntimeUpdateReady(
            async () => {
                reloadWindowForRecovery('vite-preload-error', reload, {
                    resumeHref,
                })
            },
            {
                mode: 'custom',
                recoveryReason: 'vite-preload-error',
                resumeHref,
            }
        )
        return true
    }

    publishRuntimeUpdateReady(undefined, {
        mode: 'reload',
        recoveryReason: 'vite-preload-error',
        resumeHref,
    })
    return true
}

export function installVitePreloadErrorHandler(): void {
    if (typeof window === 'undefined' || hasInstalledVitePreloadErrorHandler) {
        return
    }

    window.addEventListener(VITE_PRELOAD_ERROR_EVENT, (event: Event) => {
        const preloadEvent = event as VitePreloadErrorEvent
        console.error('Failed to preload route chunk:', preloadEvent.payload)
        event.preventDefault()
        void recoverFromVitePreloadError(preloadEvent.payload)
    })
    hasInstalledVitePreloadErrorHandler = true
}
