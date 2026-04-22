import { isSameSessionSwitchTargetDriver, type SameSessionSwitchTargetDriver } from '@viby/protocol'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode, Session } from '@/types/api'

type SessionActionResponse = {
    ok: true
    session: Session
}

type ResumeSessionResponse = {
    type: 'success'
    session: Session
}

type SessionActionLegacyResponse = {
    ok: true
}

type ResumeSessionLegacyResponse = {
    type: 'success'
    sessionId: string
}

type DriverSwitchResponse = {
    ok: true
    targetDriver: SameSessionSwitchTargetDriver
    session: Session
}

export type SessionSnapshotAction =
    | 'archive'
    | 'close'
    | 'unarchive'
    | 'permission-mode'
    | 'collaboration-mode'
    | 'model'
    | 'model-reasoning-effort'

export type ApprovePermissionOptions = {
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    allowTools?: string[]
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    answers?: Record<string, string[]> | Record<string, { answers: string[] }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isSession(value: unknown): value is Session {
    return isRecord(value) && typeof value.id === 'string'
}

export function isResumeSessionResponse(value: unknown): value is ResumeSessionResponse {
    return isRecord(value) && value.type === 'success' && isSession(value.session)
}

export function isResumeSessionLegacyResponse(value: unknown): value is ResumeSessionLegacyResponse {
    return isRecord(value) && value.type === 'success' && typeof value.sessionId === 'string'
}

export function isSessionActionResponse(value: unknown): value is SessionActionResponse {
    return isRecord(value) && value.ok === true && isSession(value.session)
}

export function isSessionActionLegacyResponse(value: unknown): value is SessionActionLegacyResponse {
    return isRecord(value) && value.ok === true
}

export function isDriverSwitchResponse(value: unknown): value is DriverSwitchResponse {
    return (
        isRecord(value) &&
        value.ok === true &&
        isSameSessionSwitchTargetDriver(value.targetDriver) &&
        isSession(value.session)
    )
}

export function normalizeApprovePermissionBody(
    modeOrOptions?: ApprovePermissionOptions['mode'] | ApprovePermissionOptions
): ApprovePermissionOptions {
    if (typeof modeOrOptions === 'string' || modeOrOptions === undefined) {
        return { mode: modeOrOptions }
    }

    return modeOrOptions
}

export type SessionSnapshotBody = {
    mode?: PermissionMode | CodexCollaborationMode
    model?: string | null
    modelReasoningEffort?: ModelReasoningEffort | null
}
