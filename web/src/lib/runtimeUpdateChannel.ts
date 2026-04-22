import { type AppRecoveryReason, recordPendingAppRecovery } from '@/lib/appRecovery'
import { readBrowserStorageJson, removeBrowserStorageItem, writeBrowserStorageJson } from '@/lib/browserStorage'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'

export const RUNTIME_UPDATE_READY_EVENT = 'viby:runtime-update-ready'
export const RUNTIME_UPDATE_STORAGE_KEY = 'viby-runtime-update-ready'

export type RuntimeUpdateSnapshot = {
    availableAt: number
    mode?: 'reload' | 'custom'
    recoveryReason?: Extract<
        AppRecoveryReason,
        'runtime-asset-reload' | 'vite-preload-error' | 'local-service-worker-reset'
    >
    resumeHref?: string
}

type RuntimeUpdateAction = () => Promise<void>

let pendingRuntimeUpdate: RuntimeUpdateSnapshot | null = null
let pendingRuntimeUpdateAction: RuntimeUpdateAction | null = null
let pendingRuntimeUpdateApply: Promise<boolean> | null = null

function normalizeResumeHref(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }

    const trimmed = value.trim()
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
        return undefined
    }

    return trimmed
}

function parseSnapshot(rawValue: string): RuntimeUpdateSnapshot | null {
    try {
        const parsed = JSON.parse(rawValue) as Partial<RuntimeUpdateSnapshot>
        if (typeof parsed.availableAt !== 'number') {
            return null
        }

        const mode = parsed.mode === 'reload' ? 'reload' : 'custom'
        const recoveryReason =
            parsed.recoveryReason === 'runtime-asset-reload' ||
            parsed.recoveryReason === 'vite-preload-error' ||
            parsed.recoveryReason === 'local-service-worker-reset'
                ? parsed.recoveryReason
                : undefined

        return {
            availableAt: parsed.availableAt,
            mode,
            recoveryReason,
            resumeHref: normalizeResumeHref(parsed.resumeHref),
        }
    } catch {
        return null
    }
}

function writeSnapshotToSessionStorage(snapshot: RuntimeUpdateSnapshot | null): void {
    if (!snapshot) {
        removeBrowserStorageItem('session', RUNTIME_UPDATE_STORAGE_KEY)
        return
    }

    writeBrowserStorageJson('session', RUNTIME_UPDATE_STORAGE_KEY, snapshot)
}

function readSnapshotFromSessionStorage(): RuntimeUpdateSnapshot | null {
    return readBrowserStorageJson({
        storage: 'session',
        key: RUNTIME_UPDATE_STORAGE_KEY,
        parse: parseSnapshot,
    })
}

function clearPendingRuntimeUpdate(): void {
    pendingRuntimeUpdate = null
    pendingRuntimeUpdateAction = null
    pendingRuntimeUpdateApply = null
    writeSnapshotToSessionStorage(null)
}

function dispatchRuntimeUpdateReady(snapshot: RuntimeUpdateSnapshot): void {
    if (typeof window === 'undefined') {
        return
    }

    window.dispatchEvent(
        new CustomEvent<RuntimeUpdateSnapshot>(RUNTIME_UPDATE_READY_EVENT, {
            detail: snapshot,
        })
    )
}

export function publishRuntimeUpdateReady(
    action?: RuntimeUpdateAction,
    options: Readonly<{
        mode?: RuntimeUpdateSnapshot['mode']
        recoveryReason?: RuntimeUpdateSnapshot['recoveryReason']
        resumeHref?: string
    }> = {}
): RuntimeUpdateSnapshot | null {
    const existing = readPendingRuntimeUpdate()
    if (existing) {
        if (!pendingRuntimeUpdateAction && action) {
            pendingRuntimeUpdateAction = action
        }
        return existing
    }

    const snapshot: RuntimeUpdateSnapshot = {
        availableAt: Date.now(),
        mode: options.mode ?? (action ? 'custom' : 'reload'),
        recoveryReason: options.recoveryReason,
        resumeHref: normalizeResumeHref(options.resumeHref),
    }

    pendingRuntimeUpdate = snapshot
    pendingRuntimeUpdateAction = action ?? null
    writeSnapshotToSessionStorage(snapshot)
    appendRealtimeTrace({
        at: snapshot.availableAt,
        type: 'update_available',
    })
    dispatchRuntimeUpdateReady(snapshot)
    return snapshot
}

export function readPendingRuntimeUpdate(): RuntimeUpdateSnapshot | null {
    if (!pendingRuntimeUpdate) {
        pendingRuntimeUpdate = readSnapshotFromSessionStorage()
    }

    return pendingRuntimeUpdate
}

export async function applyPendingRuntimeUpdate(): Promise<boolean> {
    if (pendingRuntimeUpdateApply) {
        return pendingRuntimeUpdateApply
    }

    const action = pendingRuntimeUpdateAction
    const snapshot = readPendingRuntimeUpdate()
    if (!snapshot) {
        return false
    }

    const applyAction =
        action ??
        (snapshot.mode === 'reload'
            ? async () => {
                  if (snapshot.recoveryReason) {
                      recordPendingAppRecovery(snapshot.recoveryReason, {
                          resumeHref: snapshot.resumeHref,
                      })
                  }
                  window.location.reload()
              }
            : null)
    if (!applyAction) {
        return false
    }

    pendingRuntimeUpdateApply = (async () => {
        appendRealtimeTrace({
            at: Date.now(),
            type: 'update_apply',
            details: {
                availableAt: snapshot.availableAt,
            },
        })

        try {
            await applyAction()
            clearPendingRuntimeUpdate()
            return true
        } catch (error) {
            appendRealtimeTrace({
                at: Date.now(),
                type: 'update_apply_error',
                details: {
                    availableAt: snapshot.availableAt,
                    message: error instanceof Error ? error.message : 'unknown',
                },
            })
            throw error
        } finally {
            pendingRuntimeUpdateApply = null
        }
    })()

    return pendingRuntimeUpdateApply
}

export function resetPendingRuntimeUpdate(): void {
    clearPendingRuntimeUpdate()
}
