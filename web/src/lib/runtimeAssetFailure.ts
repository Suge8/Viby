import { recordPendingAppRecovery } from '@/lib/appRecovery'

const ASSET_FAILURE_MESSAGES = [
    'failed to fetch dynamically imported module',
    'importing a module script failed',
    'loading module from',
    'dynamically imported module',
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

// 判定依据严格收敛于明确的 vite/chunk 加载失败信号；不再以 URL 路径含 /assets/ 作为单独证据，
// 避免把无关紧要的 modulepreload / 资源 hint 失败升级为致命错误，引发 boot 期 reload 死循环。
export function isLikelyRuntimeAssetFailure(failure: RuntimeAssetFailure): boolean {
    const name = normalizeErrorText(failure.name)
    if (name === 'chunkloaderror' || name === 'vitepreloaderror') {
        return true
    }

    const message = normalizeErrorText(failure.message)
    const stack = normalizeErrorText(failure.stack)
    if (hasKnownAssetLoadFailureText([message, stack])) {
        return true
    }

    const filename = normalizeErrorText(failure.filename)
    return containsAssetPath(filename) && hasKnownAssetLoadFailureText([message])
}

export function recordRuntimeAssetFailureRecovery(options: RecordRuntimeAssetFailureRecoveryOptions): boolean {
    if (!isLikelyRuntimeAssetFailure(options.failure)) {
        return false
    }

    recordPendingAppRecovery(options.reason, {
        resumeHref: options.resumeHref,
    })
    return true
}
