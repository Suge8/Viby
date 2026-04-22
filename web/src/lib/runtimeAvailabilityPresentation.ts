import type { LocalRuntime } from '@/types/api'
import { formatRunnerSpawnError } from '@/utils/formatRunnerSpawnError'
import type { I18nContextValue } from './use-translation'

type TranslationFn = I18nContextValue['t']

type RuntimeAvailabilityOptions = {
    runtime: LocalRuntime | null
    isLoading: boolean
    error: string | null
    t: TranslationFn
}

type RuntimeAvailabilityCopyOptions = {
    loadRuntimeErrorTitle: string
    t: TranslationFn
}

export type RuntimeAvailabilityPresentation =
    | { kind: 'loading' }
    | { kind: 'ready' }
    | { kind: 'load-error'; detail: string }
    | { kind: 'unavailable'; detail: string | null; noticeDescription: string }

export type RuntimeAvailabilityCopy = {
    noticeTitle: string
    noticeDescription: string
    blockedTitle: string
    blockedDescription: string
    blockedDetail: string
}

export function getRuntimeAvailabilityPresentation(
    options: RuntimeAvailabilityOptions
): RuntimeAvailabilityPresentation {
    if (options.isLoading) {
        return { kind: 'loading' }
    }

    if (options.runtime?.active) {
        return { kind: 'ready' }
    }

    if (!options.runtime) {
        if (options.error) {
            return {
                kind: 'load-error',
                detail: options.error,
            }
        }

        return {
            kind: 'unavailable',
            detail: null,
            noticeDescription: options.t('runtime.unavailable.message'),
        }
    }

    const lastSpawnError = formatRunnerSpawnError(options.runtime)
    if (!lastSpawnError) {
        return {
            kind: 'unavailable',
            detail: null,
            noticeDescription: options.t('runtime.unavailable.message'),
        }
    }

    const detail = options.t('runtime.unavailable.lastError', { error: lastSpawnError })
    return {
        kind: 'unavailable',
        detail,
        noticeDescription: detail,
    }
}

export function getRuntimeAvailabilityCopy(
    availability: RuntimeAvailabilityPresentation,
    options: RuntimeAvailabilityCopyOptions
): RuntimeAvailabilityCopy | null {
    if (availability.kind === 'load-error') {
        return {
            noticeTitle: options.loadRuntimeErrorTitle,
            noticeDescription: availability.detail,
            blockedTitle: options.loadRuntimeErrorTitle,
            blockedDescription: options.t('runtime.unavailable.loadMessage'),
            blockedDetail: availability.detail,
        }
    }

    if (availability.kind !== 'unavailable') {
        return null
    }

    return {
        noticeTitle: options.t('runtime.unavailable.title'),
        noticeDescription: availability.noticeDescription,
        blockedTitle: options.t('runtime.unavailable.title'),
        blockedDescription: options.t('runtime.unavailable.message'),
        blockedDetail: availability.detail ?? options.t('runtime.unavailable.hint'),
    }
}
