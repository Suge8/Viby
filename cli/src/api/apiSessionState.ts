import { isSystemInjectedPseudoUserText } from '@viby/protocol'
import { EMPTY_SESSION_CONTINUITY_FIRST_TURN_ERROR } from '@/agent/driverSwitchHandoffState'
import type { RawJSONLines } from '@/claude/types'
import type {
    MessageContent,
    Metadata,
    Session,
    SessionCollaborationMode,
    SessionModel,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    WritableSessionMetadata,
} from './types'

export const API_SESSION_REQUEST_TIMEOUT_MS = 15_000
export const SESSION_STATE_FLUSH_TIMEOUT_MS = 5_000

export type MetadataUpdateOptions = {
    touchUpdatedAt?: boolean
}

export type SessionKeepAliveRuntime = {
    permissionMode?: SessionPermissionMode
    model?: SessionModel
    modelReasoningEffort?: SessionModelReasoningEffort
    collaborationMode?: SessionCollaborationMode
}

export type SessionKeepAliveSnapshot = SessionKeepAliveRuntime & {
    thinking: boolean
    mode: 'remote'
}

export type DriverSwitchSendFailureCode = 'empty_first_turn' | 'timeout' | 'unknown'

const LIFECYCLE_METADATA_FIELDS = ['lifecycleState', 'lifecycleStateSince', 'archivedBy', 'archiveReason'] as const

export function isExternalUserMessage(body: RawJSONLines): body is Extract<RawJSONLines, { type: 'user' }> & {
    message: { content: string }
} {
    if (body.type !== 'user') return false
    if (typeof body.message.content !== 'string') return false
    if (body.isSidechain === true) return false
    if (body.isMeta === true) return false

    return !isSystemInjectedPseudoUserText(body.message.content)
}

export function isExternalSessionUserMessage(message: {
    role: 'user'
    content: { type: 'text'; text: string }
}): boolean {
    return !isSystemInjectedPseudoUserText(message.content.text)
}

export function readObservedAutoSummary(message: unknown): { text: string; updatedAt: number | null } | null {
    const candidate = message as MessageContent | null
    if (
        !candidate ||
        candidate.role !== 'agent' ||
        candidate.content?.type !== 'output' ||
        typeof candidate.content.data !== 'object' ||
        candidate.content.data === null
    ) {
        return null
    }

    const data = candidate.content.data as {
        type?: unknown
        summary?: unknown
        updatedAt?: unknown
        isMeta?: unknown
    }
    if (
        data.isMeta !== true ||
        data.type !== 'summary' ||
        typeof data.summary !== 'string' ||
        data.summary.trim().length === 0
    ) {
        return null
    }

    return {
        text: data.summary,
        updatedAt: typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) ? data.updatedAt : null,
    }
}

export function createInitialKeepAliveSnapshot(session: Session): SessionKeepAliveSnapshot {
    return {
        thinking: session.thinking,
        mode: 'remote',
        ...(session.permissionMode !== undefined ? { permissionMode: session.permissionMode } : {}),
        ...(session.model !== undefined ? { model: session.model } : {}),
        ...(session.modelReasoningEffort !== undefined ? { modelReasoningEffort: session.modelReasoningEffort } : {}),
        ...(session.collaborationMode !== undefined ? { collaborationMode: session.collaborationMode } : {}),
    }
}

export function toSessionAlivePayload(
    sessionId: string,
    snapshot: SessionKeepAliveSnapshot
): {
    sid: string
    time: number
    thinking: boolean
    mode: 'remote'
    permissionMode?: SessionPermissionMode
    model?: SessionModel
    modelReasoningEffort?: SessionModelReasoningEffort
    collaborationMode?: SessionCollaborationMode
} {
    return {
        sid: sessionId,
        time: Date.now(),
        thinking: snapshot.thinking,
        mode: snapshot.mode,
        ...(snapshot.permissionMode !== undefined ? { permissionMode: snapshot.permissionMode } : {}),
        ...(snapshot.model !== undefined ? { model: snapshot.model } : {}),
        ...(snapshot.modelReasoningEffort !== undefined ? { modelReasoningEffort: snapshot.modelReasoningEffort } : {}),
        ...(snapshot.collaborationMode !== undefined ? { collaborationMode: snapshot.collaborationMode } : {}),
    }
}

export function stripLifecycleMetadataFields<T extends Record<string, unknown>>(metadata: T): T {
    const nextMetadata = { ...metadata }

    for (const field of LIFECYCLE_METADATA_FIELDS) {
        delete nextMetadata[field]
    }

    return nextMetadata
}

export function createWritableSessionMetadataSnapshot(metadata: Metadata | null): WritableSessionMetadata {
    if (!metadata) {
        return {} as WritableSessionMetadata
    }

    return stripLifecycleMetadataFields(metadata) as WritableSessionMetadata
}

export function resolveDriverSwitchSendFailureCode(error: unknown): DriverSwitchSendFailureCode {
    if (error instanceof Error && error.message === EMPTY_SESSION_CONTINUITY_FIRST_TURN_ERROR) {
        return 'empty_first_turn'
    }

    if (
        (error instanceof Error && error.name === 'TimeoutError') ||
        (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ETIMEDOUT')
    ) {
        return 'timeout'
    }

    return 'unknown'
}
