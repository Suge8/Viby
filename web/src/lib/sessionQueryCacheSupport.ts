import { resolveSessionDriver } from '@viby/protocol'
import type { Session, SessionSummary } from '@/types/api'

export type ResumableSession = Session & {
    resumeAvailable?: boolean
}

export function attachPersistedResumeAvailability(
    session: Session,
    persistedResumeAvailable: boolean | undefined
): ResumableSession {
    if (persistedResumeAvailable === undefined) {
        return session
    }

    return {
        ...session,
        resumeAvailable: persistedResumeAvailable,
    }
}

export function resolvePersistedResumeAvailability(options: {
    session: Session
    cachedSession?: Session | undefined
    summary?: Pick<SessionSummary, 'resumeAvailable'> | null | undefined
}): boolean | undefined {
    return (
        getOptionalResumeAvailability(options.session) ??
        getOptionalResumeAvailability(options.cachedSession) ??
        options.summary?.resumeAvailable
    )
}

export function buildSessionPlaceholderSession(summary: SessionSummary): ResumableSession {
    const driver = resolveSessionDriver(summary.metadata)

    return {
        id: summary.id,
        seq: 0,
        createdAt: summary.activeAt || summary.updatedAt,
        updatedAt: summary.updatedAt,
        active: summary.active,
        activeAt: summary.activeAt,
        metadata: summary.metadata
            ? {
                  path: summary.metadata.path,
                  host: '',
                  name: summary.metadata.name,
                  summary: summary.metadata.summary,
                  driver,
                  worktree: summary.metadata.worktree,
                  lifecycleState: summary.lifecycleState,
                  lifecycleStateSince: summary.lifecycleStateSince ?? undefined,
              }
            : null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: summary.thinking,
        thinkingAt: summary.latestActivityAt ?? summary.updatedAt,
        model: summary.model,
        modelReasoningEffort: summary.modelReasoningEffort,
        permissionMode: summary.permissionMode,
        collaborationMode: summary.collaborationMode,
        todos: undefined,
        // Summary seeds do not carry the provider token itself, only the durable
        // fact that the Hub already marked this session resumable.
        resumeAvailable: summary.resumeAvailable,
    }
}

function getOptionalResumeAvailability(session: Session | undefined): boolean | undefined {
    if (!session || !('resumeAvailable' in session) || typeof session.resumeAvailable !== 'boolean') {
        return undefined
    }

    return session.resumeAvailable
}
