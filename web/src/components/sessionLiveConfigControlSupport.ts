import type { ApiClient } from '@/api/client'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import type { PiModelCapability } from '@/types/api'

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

const SWITCH_DRIVER_ERROR_CODE_MAP = {
    session_not_idle: 'chat.switchDriver.failed.sessionNotIdle',
    session_not_found: 'chat.switchDriver.failed.sessionNotFound',
    unsupported_target_driver: 'chat.switchDriver.failed.generic',
    target_driver_matches_current: 'chat.switchDriver.failed.generic',
    target_driver_unavailable: 'chat.switchDriver.failed.targetUnavailable',
    handoff_build_failed: 'chat.switchDriver.failed.generic',
    stop_failed: 'chat.switchDriver.failed.generic',
    stop_timeout: 'chat.switchDriver.failed.generic',
    spawn_failed: 'chat.switchDriver.failed.generic',
    spawn_session_mismatch: 'chat.switchDriver.failed.generic',
    attach_timeout: 'chat.switchDriver.failed.generic',
    attach_failed: 'chat.switchDriver.failed.generic',
    marker_append_failed: 'chat.switchDriver.failed.generic',
} as const

export function assertSessionConfigApi(api: ApiClient | null): ApiClient {
    if (!api) {
        throw new Error('Session unavailable')
    }
    return api
}

export function assertSessionConfigCapability(enabled: boolean, message: string): void {
    if (!enabled) {
        throw new Error(message)
    }
}

export function formatSwitchDriverErrorMessage(error: unknown, t: TranslationFn): string {
    return formatUserFacingErrorMessage(error, {
        t,
        fallbackKey: 'chat.switchDriver.failed.generic',
        codeMap: SWITCH_DRIVER_ERROR_CODE_MAP,
        messageMap: [{ match: 'Invalid driver switch response', key: 'chat.switchDriver.failed.generic' }],
    })
}

export function resolveActivePiCapability(
    currentModel: string | null | undefined,
    capabilities: readonly PiModelCapability[] | null | undefined
): PiModelCapability | null {
    if (!capabilities?.length) {
        return null
    }
    const normalizedModel = currentModel?.trim()
    return normalizedModel ? (capabilities.find((capability) => capability.id === normalizedModel) ?? null) : null
}
