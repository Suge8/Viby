import type {
    CodexCollaborationMode,
    CodexServiceTier,
    ModelReasoningEffort,
    PermissionMode,
    Session,
} from '@viby/protocol/types'
import type { DriverSwitchResult, ResumeSessionResult, SessionLifecycleService } from './sessionLifecycleService'
import type { DriverSwitchHooks } from './sessionLifecycleSupport'

export type SessionCommandErrorCode =
    | 'session_not_found'
    | 'no_machine_online'
    | 'resume_unavailable'
    | 'resume_failed'
    | 'session_archived'
    | 'session_action_failed'

export type SessionCommandStatus = 400 | 404 | 409 | 500 | 503

export type SessionCommand =
    | { type: 'abort'; sessionId: string }
    | { type: 'close'; sessionId: string }
    | { type: 'archive'; sessionId: string }
    | { type: 'unarchive'; sessionId: string }
    | {
          type: 'resume'
          sessionId: string
          hooks?: Parameters<SessionLifecycleService['resumeSession']>[1]
          permissionMode?: PermissionMode
      }
    | {
          type: 'driver-switch'
          sessionId: string
          targetDriver: Parameters<SessionLifecycleService['switchSessionDriver']>[1]
          hooks: DriverSwitchHooks
      }
    | { type: 'permission-mode'; sessionId: string; mode: PermissionMode }
    | { type: 'collaboration-mode'; sessionId: string; mode: CodexCollaborationMode }
    | { type: 'model'; sessionId: string; model: string | null }
    | { type: 'model-reasoning-effort'; sessionId: string; modelReasoningEffort: ModelReasoningEffort | null }
    | { type: 'codex-service-tier'; sessionId: string; codexServiceTier: CodexServiceTier | null }

export type SessionCommandRequest = SessionCommand extends infer Command
    ? Command extends object
        ? 'hooks' extends keyof Command
            ? Omit<Command, 'hooks'>
            : Command
        : never
    : never

export type SessionCommandErrorPayload = {
    message: string
    code: SessionCommandErrorCode
    status: SessionCommandStatus
}

export type SessionCommandResult =
    | {
          ok: true
          command: SessionCommand['type']
          session?: Session
          resume?: ResumeSessionResult
          driverSwitch?: DriverSwitchResult
      }
    | {
          ok: false
          command: SessionCommand['type']
          error: SessionCommandErrorPayload
          driverSwitch?: Extract<DriverSwitchResult, { type: 'error' }>
      }

export type SessionCommandResumeResult = ResumeSessionResult

export class SessionCommandError extends Error {
    constructor(
        message: string,
        readonly code: SessionCommandErrorCode,
        readonly status: SessionCommandStatus
    ) {
        super(message)
        this.name = 'SessionCommandError'
    }
}

export function getSessionCommandResumeStatus(code: SessionCommandErrorCode): SessionCommandStatus {
    switch (code) {
        case 'no_machine_online':
            return 503
        case 'session_not_found':
            return 404
        case 'session_archived':
            return 409
        case 'session_action_failed':
            return 400
        default:
            return 500
    }
}

export function toSessionCommandError(error: unknown): SessionCommandErrorPayload {
    if (error instanceof SessionCommandError) {
        return { message: error.message, code: error.code, status: error.status }
    }
    return {
        message: error instanceof Error ? error.message : String(error),
        code: 'session_action_failed',
        status: 500,
    }
}

export function unwrapSessionCommandResult(result: SessionCommandResult): Session {
    if (!result.ok) throw new SessionCommandError(result.error.message, result.error.code, result.error.status)
    if (!result.session) {
        throw new SessionCommandError('Session command did not return a session', 'session_action_failed', 500)
    }
    return result.session
}
