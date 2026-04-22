import { resolveInactiveSessionLifecycleState } from '@viby/protocol'
import { MetadataSchema } from '@viby/protocol/schemas'
import type { Metadata, Session, SessionLifecycleState } from '@viby/protocol/types'
import type { Store } from '../store'

export function buildLifecycleMetadata(
    metadata: Metadata,
    lifecycleState: SessionLifecycleState,
    options?: {
        archivedBy?: string
        archiveReason?: string
    }
): Metadata {
    if (lifecycleState !== 'archived') {
        return {
            ...metadata,
            lifecycleState,
            lifecycleStateSince: Date.now(),
            archivedBy: undefined,
            archiveReason: undefined,
        }
    }

    return {
        ...metadata,
        lifecycleState,
        lifecycleStateSince: Date.now(),
        archivedBy: options?.archivedBy ?? 'web',
        archiveReason: options?.archiveReason ?? 'Archived by user',
    }
}

type GetSession = (sessionId: string) => Session | null | undefined
type RefreshSession = (sessionId: string) => Session | null

export class SessionMetadataMutationService {
    static readonly MAX_ATTEMPTS = 3

    constructor(
        private readonly store: Store,
        private readonly getSession: GetSession,
        private readonly refreshSession: RefreshSession
    ) {}

    normalizeInactiveStoredLifecycle(sessionId: string): void {
        for (let attempt = 0; attempt < SessionMetadataMutationService.MAX_ATTEMPTS; attempt += 1) {
            const storedSession = this.store.sessions.getSession(sessionId)
            if (!storedSession || storedSession.active) {
                return
            }

            const parsedMetadata = MetadataSchema.safeParse(storedSession.metadata)
            if (!parsedMetadata.success) {
                return
            }

            const currentLifecycleState = parsedMetadata.data.lifecycleState
            const normalizedLifecycleState = resolveInactiveSessionLifecycleState(currentLifecycleState)
            if (currentLifecycleState === normalizedLifecycleState) {
                return
            }

            const result = this.store.sessions.updateSessionMetadata(
                sessionId,
                buildLifecycleMetadata(parsedMetadata.data, normalizedLifecycleState),
                storedSession.metadataVersion,
                { touchUpdatedAt: false }
            )

            if (result.result === 'success') {
                return
            }
            if (result.result === 'error') {
                throw new Error(`Failed to normalize inactive lifecycle for session ${sessionId}`)
            }
        }

        throw new Error(`Inactive lifecycle normalization conflicted for session ${sessionId}`)
    }

    commitMetadataMutation(
        sessionId: string,
        buildNextMetadata: (currentMetadata: Metadata) => Metadata,
        options?: { touchUpdatedAt?: boolean }
    ): Session {
        const cachedSession = this.getSession(sessionId) ?? this.refreshSession(sessionId)
        if (!cachedSession) {
            throw new Error('Session not found')
        }

        const fallbackMetadata = cachedSession.metadata ?? { path: '', host: '' }
        for (let attempt = 0; attempt < SessionMetadataMutationService.MAX_ATTEMPTS; attempt += 1) {
            const storedSession = this.store.sessions.getSession(sessionId)
            if (!storedSession) {
                this.refreshSession(sessionId)
                throw new Error('Session not found')
            }

            const parsedMetadata = MetadataSchema.safeParse(storedSession.metadata)
            const currentMetadata = parsedMetadata.success ? parsedMetadata.data : fallbackMetadata
            const nextMetadata = buildNextMetadata(currentMetadata)
            const result = this.store.sessions.updateSessionMetadata(
                sessionId,
                nextMetadata,
                storedSession.metadataVersion,
                { touchUpdatedAt: options?.touchUpdatedAt }
            )

            if (result.result === 'success') {
                const refreshedSession = this.refreshSession(sessionId)
                if (!refreshedSession) {
                    throw new Error('Session not found')
                }
                return refreshedSession
            }
            if (result.result === 'error') {
                throw new Error('Failed to update session metadata')
            }
        }

        throw new Error('Session was modified concurrently. Please try again.')
    }
}
