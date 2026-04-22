import type { Metadata } from './schemas'
import {
    getSessionDriverResumeToken,
    supportsHandlelessSessionResume,
    supportsSessionContinuityResume,
} from './sessionDriver'
import type { SessionSummary } from './sessionSummary'

export const DEFAULT_RESUMABLE_SESSIONS_LIMIT = 20
export const MAX_RESUMABLE_SESSIONS_LIMIT = 100
export const SESSION_RESUME_STRATEGIES = ['provider-handle', 'continuity-handoff', 'transcript-replay', 'none'] as const

export type SessionResumeStrategy = (typeof SESSION_RESUME_STRATEGIES)[number]
export type SessionResumeState = {
    resumeAvailable: boolean
    resumeStrategy: SessionResumeStrategy
}

export type ResumableSessionsPage = {
    cursor: string | null
    nextCursor: string | null
    limit: number
    hasMore: boolean
}

export type ResumableSessionsSnapshot = {
    revision: string
    notModified?: false
    sessions: SessionSummary[]
    page: ResumableSessionsPage
}

export type ResumableSessionsNotModified = {
    revision: string
    notModified: true
}

export type ResumableSessionsResponse = ResumableSessionsSnapshot | ResumableSessionsNotModified

export function resolveSessionResumeStrategy(
    metadata: Partial<Pick<Metadata, 'driver' | 'runtimeHandles' | 'startedBy'>> | null | undefined
): SessionResumeStrategy {
    return resolveSessionResumeState({ metadata }).resumeStrategy
}

export function resolveSessionResumeState(options: {
    metadata: Partial<Pick<Metadata, 'driver' | 'runtimeHandles' | 'startedBy'>> | null | undefined
    resumeAvailableHint?: boolean
}): SessionResumeState {
    if (options.resumeAvailableHint === true) {
        return {
            resumeAvailable: true,
            resumeStrategy: resolveMetadataSessionResumeStrategy(options.metadata),
        }
    }

    const resumeStrategy = resolveMetadataSessionResumeStrategy(options.metadata)
    return {
        resumeAvailable: resumeStrategy !== 'none',
        resumeStrategy,
    }
}

function resolveMetadataSessionResumeStrategy(
    metadata: Partial<Pick<Metadata, 'driver' | 'runtimeHandles' | 'startedBy'>> | null | undefined
): SessionResumeStrategy {
    if (getSessionDriverResumeToken(metadata) !== undefined) {
        return 'provider-handle'
    }

    if (supportsHandlelessSessionResume(metadata)) {
        return 'transcript-replay'
    }

    if (supportsSessionContinuityResume(metadata)) {
        return 'continuity-handoff'
    }

    return 'none'
}
