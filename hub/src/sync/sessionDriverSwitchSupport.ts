import type { SessionDriver, SessionHandoffSnapshot } from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import type { NormalizedDriverSwitchConfig } from './sessionSwitchConfig'

export type DriverSwitchStage = 'idle_gate' | 'handoff_build' | 'stop' | 'spawn' | 'attach' | 'marker_append'
export type DriverSwitchErrorCode =
    | 'session_not_found'
    | 'unsupported_target_driver'
    | 'target_driver_matches_current'
    | 'target_driver_unavailable'
    | 'session_not_idle'
    | 'handoff_build_failed'
    | 'stop_failed'
    | 'stop_timeout'
    | 'spawn_failed'
    | 'spawn_session_mismatch'
    | 'attach_timeout'
    | 'attach_failed'
    | 'marker_append_failed'
export type DriverSwitchRollbackResult =
    | 'not_started'
    | 'not_needed'
    | 'session_metadata_restored'
    | 'session_metadata_restore_failed'
export type DriverSwitchResult =
    | { type: 'success'; session: Session; targetDriver: SessionDriver }
    | {
          type: 'error'
          message: string
          code: DriverSwitchErrorCode
          stage: DriverSwitchStage
          status: 404 | 409 | 500
          targetDriver: SessionDriver
          rollbackResult: DriverSwitchRollbackResult
          session: Session | null
      }

export function buildDriverSwitchHandoffSnapshot(
    snapshot: SessionHandoffSnapshot,
    normalizedConfig: NormalizedDriverSwitchConfig
): SessionHandoffSnapshot {
    return {
        ...snapshot,
        liveConfig: {
            model: normalizedConfig.durableConfig.model ?? null,
            modelReasoningEffort: normalizedConfig.durableConfig.modelReasoningEffort ?? null,
            permissionMode: normalizedConfig.durableConfig.permissionMode,
            collaborationMode: normalizedConfig.durableConfig.collaborationMode ?? undefined,
        },
    }
}

export function createDriverSwitchError(
    message: string,
    options: {
        code: DriverSwitchErrorCode
        stage: DriverSwitchStage
        targetDriver: SessionDriver
        rollbackResult?: DriverSwitchRollbackResult
        session?: Session | null
    }
): Extract<DriverSwitchResult, { type: 'error' }> {
    return {
        type: 'error',
        message,
        code: options.code,
        stage: options.stage,
        status: getDriverSwitchStatus(options.code),
        targetDriver: options.targetDriver,
        rollbackResult: options.rollbackResult ?? 'not_started',
        session: options.session ?? null,
    }
}

function getDriverSwitchStatus(code: DriverSwitchErrorCode): 404 | 409 | 500 {
    switch (code) {
        case 'session_not_found':
            return 404
        case 'unsupported_target_driver':
        case 'target_driver_matches_current':
        case 'target_driver_unavailable':
        case 'session_not_idle':
            return 409
        default:
            return 500
    }
}
