import { resolveInactiveSessionLifecycleState } from '@viby/protocol'
import type { Metadata, Session, SessionLifecycleState, SyncEvent } from '@viby/protocol/types'
import type { Store } from '../store'
import type { SyncEventListener } from './eventPublisher'
import { EventPublisher } from './eventPublisher'
import { refreshSessionSnapshot } from './sessionCacheSnapshot'
import { SessionConfigMutationService } from './sessionConfigMutationService'
import { SessionListSnapshotCache } from './sessionListSnapshotCache'
import { buildLifecycleMetadata, SessionMetadataMutationService } from './sessionMetadataMutationService'
import type { SessionConfigPatch, SessionDurableConfigPatch } from './sessionPayloadTypes'
import { SessionPresenceService } from './sessionPresenceService'
import { type WaitForSessionConditionOptions, waitForSessionCondition } from './sessionWaitForCondition'

type CreateSessionInput = Parameters<Store['sessions']['getOrCreateSession']>[0]

export class SessionCache {
    private readonly sessions: Map<string, Session> = new Map()
    private readonly sessionListSnapshotCache = new SessionListSnapshotCache()
    private readonly lastBroadcastAtBySessionId: Map<string, number> = new Map()
    private readonly lastPersistedActiveAtBySessionId: Map<string, number> = new Map()
    private readonly todoBackfillAttemptedSessionIds: Set<string> = new Set()
    private readonly presenceService: SessionPresenceService
    private readonly configMutationService: SessionConfigMutationService
    private readonly metadataMutationService: SessionMetadataMutationService

    constructor(
        private readonly store: Store,
        private readonly publisher: EventPublisher
    ) {
        this.presenceService = new SessionPresenceService(
            store,
            this.sessions,
            this.lastBroadcastAtBySessionId,
            this.lastPersistedActiveAtBySessionId,
            (sessionId) => this.sessions.get(sessionId) ?? this.refreshSession(sessionId),
            (sessionId, data) => {
                this.emitSessionSnapshotEvent({ type: 'session-updated', sessionId, data })
            },
            (sessionId) => this.normalizeInactiveSessionLifecycle(sessionId)
        )
        this.configMutationService = new SessionConfigMutationService(
            store,
            (sessionId) => this.sessions.get(sessionId) ?? this.refreshSession(sessionId),
            (sessionId, session) => {
                this.emitSessionSnapshotEvent({ type: 'session-updated', sessionId, data: session })
            }
        )
        this.metadataMutationService = new SessionMetadataMutationService(
            store,
            (sessionId) => this.sessions.get(sessionId) ?? this.refreshSession(sessionId),
            (sessionId) => this.refreshSession(sessionId)
        )
        this.repairInactiveRunningLifecycleDrift()
    }

    private markSessionsDirty(): void {
        this.sessionListSnapshotCache.markDirty()
    }

    private emitSessionSnapshotEvent(
        event: Extract<SyncEvent, { type: 'session-added' | 'session-updated' | 'session-removed' }>
    ): void {
        this.markSessionsDirty()
        this.publisher.emit(event)
    }

    private persistSessionInactiveState(sessionId: string): void {
        this.store.sessions.setSessionInactive(sessionId)
        this.lastPersistedActiveAtBySessionId.delete(sessionId)
    }

    private loadSession(sessionId: string): Session | null {
        return this.sessions.get(sessionId) ?? this.refreshSession(sessionId)
    }

    private clearCachedSessionState(sessionId: string): void {
        this.sessions.delete(sessionId)
        this.lastBroadcastAtBySessionId.delete(sessionId)
        this.lastPersistedActiveAtBySessionId.delete(sessionId)
        this.todoBackfillAttemptedSessionIds.delete(sessionId)
    }

    private normalizeInactiveSessionLifecycle(
        sessionId: string
    ): Pick<NonNullable<Session['metadata']>, 'lifecycleState' | 'lifecycleStateSince'> | undefined {
        const session = this.loadSession(sessionId)
        if (!session) {
            return undefined
        }

        const currentLifecycleState = session.metadata?.lifecycleState
        const normalizedLifecycleState = resolveInactiveSessionLifecycleState(currentLifecycleState)
        if (currentLifecycleState === normalizedLifecycleState) {
            return getSessionLifecycleMetadataPatch(session)
        }

        const nextSession = this.metadataMutationService.commitMetadataMutation(
            sessionId,
            (currentMetadata) => {
                return buildLifecycleMetadata(currentMetadata, normalizedLifecycleState)
            },
            { touchUpdatedAt: false }
        )

        return getSessionLifecycleMetadataPatch(nextSession)
    }

    private repairInactiveRunningLifecycleDrift(): void {
        for (const sessionId of this.store.sessions.getInactiveRunningSessionIds()) {
            this.metadataMutationService.normalizeInactiveStoredLifecycle(sessionId)
        }
    }

    getSessions(): Session[] {
        return this.sessionListSnapshotCache.getSnapshot(this.sessions)
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId)
    }

    getActiveSessions(): Session[] {
        return this.getSessions().filter((session) => session.active)
    }

    getSessionsRevision(): number {
        return this.sessionListSnapshotCache.getRevision()
    }

    subscribe(listener: SyncEventListener): () => void {
        return this.publisher.subscribe(listener)
    }

    async waitForSessionCondition<T>(sessionId: string, options: WaitForSessionConditionOptions<T>): Promise<T> {
        return await waitForSessionCondition({
            sessionId,
            loadSession: (targetSessionId) => this.loadSession(targetSessionId),
            subscribe: (listener) => this.subscribe(listener),
            condition: options,
        })
    }

    getOrCreateSession(input: CreateSessionInput): Session {
        const stored = this.store.sessions.getOrCreateSession({
            ...input,
            modelReasoningEffort: input.modelReasoningEffort ?? undefined,
        })
        return (
            this.refreshSession(stored.id) ??
            (() => {
                throw new Error('Failed to load session')
            })()
        )
    }

    refreshSession(sessionId: string): Session | null {
        return refreshSessionSnapshot({
            store: this.store,
            sessionId,
            sessions: this.sessions,
            lastBroadcastAtBySessionId: this.lastBroadcastAtBySessionId,
            lastPersistedActiveAtBySessionId: this.lastPersistedActiveAtBySessionId,
            todoBackfillAttemptedSessionIds: this.todoBackfillAttemptedSessionIds,
            emit: (event) => {
                this.emitSessionSnapshotEvent(event)
            },
        })
    }

    reloadAll(): void {
        const sessions = this.store.sessions.getSessions()
        for (const session of sessions) {
            this.refreshSession(session.id)
        }
    }

    handleSessionAlive(payload: {
        sid: string
        time: number
        thinking?: boolean
        mode?: 'local' | 'remote'
        permissionMode?: Session['permissionMode']
        model?: string | null
        modelReasoningEffort?: Session['modelReasoningEffort']
        collaborationMode?: Session['collaborationMode']
    }): void {
        this.presenceService.handleSessionAlive(payload)
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        this.presenceService.handleSessionEnd(payload)
    }

    setSessionThinking(sessionId: string, thinking: boolean, transitionAt: number = Date.now()): Session | null {
        return this.presenceService.setSessionThinking(sessionId, thinking, transitionAt)
    }

    expireInactive(now: number = Date.now()): void {
        this.presenceService.expireInactive(now)
    }

    applySessionConfig(sessionId: string, config: SessionDurableConfigPatch): void {
        this.configMutationService.applySessionConfig(sessionId, config)
    }

    async mutateSessionMetadata(
        sessionId: string,
        buildNextMetadata: (currentMetadata: Metadata) => Metadata,
        options?: { touchUpdatedAt?: boolean }
    ): Promise<Session> {
        return this.metadataMutationService.commitMetadataMutation(sessionId, buildNextMetadata, options)
    }

    async renameSession(sessionId: string, name: string): Promise<Session> {
        return this.mutateSessionMetadata(
            sessionId,
            (currentMetadata) => ({
                ...currentMetadata,
                name,
            }),
            { touchUpdatedAt: false }
        )
    }

    async setSessionLifecycleState(
        sessionId: string,
        lifecycleState: SessionLifecycleState,
        options?: {
            archivedBy?: string
            archiveReason?: string
            touchUpdatedAt?: boolean
        }
    ): Promise<void> {
        await this.mutateSessionMetadata(
            sessionId,
            (currentMetadata) => {
                return buildLifecycleMetadata(currentMetadata, lifecycleState, options)
            },
            { touchUpdatedAt: options?.touchUpdatedAt }
        )
    }

    async transitionSessionLifecycle(
        sessionId: string,
        lifecycleState: SessionLifecycleState,
        options?: {
            markInactive?: boolean
            archivedBy?: string
            archiveReason?: string
            touchUpdatedAt?: boolean
            transitionAt?: number
        }
    ): Promise<Session> {
        const cachedSession = this.loadSession(sessionId)
        if (!cachedSession) {
            throw new Error('Session not found')
        }

        if (options?.markInactive) {
            const transitionAt = options.transitionAt ?? Date.now()
            cachedSession.active = false
            cachedSession.thinking = false
            cachedSession.thinkingAt = transitionAt
            this.persistSessionInactiveState(sessionId)
        }

        return this.metadataMutationService.commitMetadataMutation(
            sessionId,
            (currentMetadata) => {
                return buildLifecycleMetadata(currentMetadata, lifecycleState, options)
            },
            { touchUpdatedAt: options?.touchUpdatedAt }
        )
    }

    async deleteSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }

        if (session.active) {
            throw new Error('Cannot delete active session')
        }

        const deleted = this.store.sessions.deleteSession(sessionId)
        if (!deleted) {
            throw new Error('Failed to delete session')
        }

        this.clearCachedSessionState(sessionId)

        this.emitSessionSnapshotEvent({ type: 'session-removed', sessionId })
    }
}

function getSessionLifecycleMetadataPatch(
    session: Session
): Pick<NonNullable<Session['metadata']>, 'lifecycleState' | 'lifecycleStateSince'> | undefined {
    if (!session.metadata) {
        return undefined
    }

    return {
        lifecycleState: session.metadata.lifecycleState,
        lifecycleStateSince: session.metadata.lifecycleStateSince,
    }
}
