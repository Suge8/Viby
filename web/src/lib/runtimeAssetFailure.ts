import { recordPendingAppRecovery } from '@/lib/appRecovery'

const ASSET_FAILURE_MESSAGES = [
    'failed to fetch dynamically imported module',
    'importing a module script failed',
    'loading module from',
    'dynamically imported module'
] as const

export type RuntimeAssetFailure = {
    name?: string | null
    filename?: string | null
    message?: string | null
    stack?: string | null
}

type RuntimeAssetRecoveryReason = Extract<
    Parameters<typeof recordPendingAppRecovery>[0],
    'vite-preload-error' | 'runtime-asset-reload'
>

type RecordRuntimeAssetFailureRecoveryOptions = {
    reason: RuntimeAssetRecoveryReason
    failure: RuntimeAssetFailure
    resumeHref?: string
}

function normalizeErrorText(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function containsAssetPath(value: string): boolean {
    return value.includes('/assets/')
}

function hasKnownAssetLoadFailureText(values: readonly string[]): boolean {
    return values.some((value) => ASSET_FAILURE_MESSAGES.some((pattern) => value.includes(pattern)))
}

export function isLikelyRuntimeAssetFailure(failure: RuntimeAssetFailure): boolean {
    const name = normalizeErrorText(failure.name)
    const filename = normalizeErrorText(failure.filename)
    const message = normalizeErrorText(failure.message)
    const stack = normalizeErrorText(failure.stack)

    if (name === 'chunkloaderror' || name === 'vitepreloaderror') {
        return true
    }

    if (hasKnownAssetLoadFailureText([message, stack])) {
        return true
    }

    return containsAssetPath(filename) && hasKnownAssetLoadFailureText([message])
}

export function recordRuntimeAssetFailureRecovery(
    options: RecordRuntimeAssetFailureRecoveryOptions
): boolean {
    if (!isLikelyRuntimeAssetFailure(options.failure)) {
        return false
    }

    recordPendingAppRecovery(options.reason, {
        resumeHref: options.resumeHref
    })
    return true
}
