import {
    readBrowserStorageJson,
    removeBrowserStorageItem,
    writeBrowserStorageJson
} from '@/lib/browserStorage'

export const APP_RECOVERY_STORAGE_KEY = 'viby-pending-app-recovery'
export const APP_BOOT_SHELL_ID = 'app-boot-shell'

const BOOT_SHELL_EXIT_CLASS_NAME = 'is-hidden'
const BOOT_SHELL_EXIT_DURATION_MS = 280
export const APP_RECOVERY_MAX_AGE_MS = 30_000
let hasConsumedDiscardedRecovery = false
const APP_RECOVERY_REASONS = [
    'page-discarded',
    'page-restored',
    'local-service-worker-reset',
    'runtime-asset-reload',
    'vite-preload-error',
    'build-assets-reset'
] as const

export type AppRecoveryReason =
    (typeof APP_RECOVERY_REASONS)[number]

export type AppRecoverySnapshot = {
    reason: AppRecoveryReason
    at: number
    resumeHref?: string
}

function isAppRecoveryReason(value: unknown): value is AppRecoveryReason {
    return typeof value === 'string' && APP_RECOVERY_REASONS.includes(value as AppRecoveryReason)
}

type RecordPendingAppRecoveryOptions = {
    resumeHref?: string | null
}

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

function createRecoverySnapshot(
    reason: AppRecoveryReason,
    options: RecordPendingAppRecoveryOptions = {}
): AppRecoverySnapshot {
    const resumeHref = normalizeResumeHref(options.resumeHref)
    return resumeHref
        ? {
            reason,
            at: Date.now(),
            resumeHref
        }
        : {
            reason,
            at: Date.now()
        }
}

function parseSnapshot(rawValue: string): AppRecoverySnapshot | null {
    try {
        const parsed = JSON.parse(rawValue) as Partial<AppRecoverySnapshot>
        if (!isAppRecoveryReason(parsed.reason) || typeof parsed.at !== 'number') {
            return null
        }
        return {
            reason: parsed.reason,
            at: parsed.at,
            resumeHref: normalizeResumeHref(parsed.resumeHref)
        }
    } catch {
        return null
    }
}

function isFreshSnapshot(
    snapshot: AppRecoverySnapshot,
    now: number = Date.now()
): boolean {
    return now - snapshot.at <= APP_RECOVERY_MAX_AGE_MS
}

export function recordPendingAppRecovery(
    reason: AppRecoveryReason,
    options: RecordPendingAppRecoveryOptions = {}
): void {
    const existing = readBrowserStorageJson({
        storage: 'session',
        key: APP_RECOVERY_STORAGE_KEY,
        parse: parseSnapshot,
        removeInvalid: false
    })
    const resumeHref = normalizeResumeHref(options.resumeHref) ?? existing?.resumeHref
    writeBrowserStorageJson('session', APP_RECOVERY_STORAGE_KEY, createRecoverySnapshot(reason, {
        resumeHref
    }))
}

export function consumePendingAppRecovery(): AppRecoverySnapshot | null {
    const snapshot = readBrowserStorageJson({
        storage: 'session',
        key: APP_RECOVERY_STORAGE_KEY,
        parse: parseSnapshot
    })
    removeBrowserStorageItem('session', APP_RECOVERY_STORAGE_KEY)
    if (!snapshot || !isFreshSnapshot(snapshot)) {
        return null
    }

    return snapshot
}

export function consumeDiscardedPageRecovery(): AppRecoverySnapshot | null {
    if (typeof document === 'undefined' || document.wasDiscarded !== true || hasConsumedDiscardedRecovery) {
        return null
    }

    hasConsumedDiscardedRecovery = true
    return {
        ...createRecoverySnapshot('page-discarded')
    }
}

export function resetAppRecoveryState(): void {
    hasConsumedDiscardedRecovery = false
}

export function reloadWindowForRecovery(
    reason: Extract<AppRecoveryReason, 'local-service-worker-reset' | 'runtime-asset-reload' | 'vite-preload-error'>,
    reload: () => void = () => window.location.reload(),
    options: RecordPendingAppRecoveryOptions = {}
): void {
    recordPendingAppRecovery(reason, options)
    reload()
}

export function finalizeBootShell(): void {
    if (typeof document === 'undefined') {
        return
    }

    const bootShell = document.getElementById(APP_BOOT_SHELL_ID)
    if (!bootShell || bootShell.classList.contains(BOOT_SHELL_EXIT_CLASS_NAME)) {
        return
    }

    bootShell.classList.add(BOOT_SHELL_EXIT_CLASS_NAME)
    window.setTimeout(() => {
        if (bootShell.parentNode) {
            bootShell.parentNode.removeChild(bootShell)
        }
    }, BOOT_SHELL_EXIT_DURATION_MS)
}
