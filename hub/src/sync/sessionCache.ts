import {
    AgentStateSchema,
    CodexCollaborationModeSchema,
    MetadataSchema,
    PermissionModeSchema,
    TeamStateSchema
} from '@viby/protocol/schemas'
import type { CodexCollaborationMode, Metadata, PermissionMode, Session, SessionLifecycleState } from '@viby/protocol/types'
import type { Store } from '../store'
import { clampAliveTime } from './aliveTime'
import { EventPublisher } from './eventPublisher'
import { extractTodoWriteTodosFromMessageContent, TodosSchema } from './todos'

const SESSION_BROADCAST_THROTTLE_MS = 10_000
const SESSION_ACTIVE_PERSIST_INTERVAL_MS = 10_000
const SESSION_INACTIVE_TIMEOUT_MS = 30_000

export class SessionCache {
    private readonly sessions: Map<string, Session> = new Map()
    private readonly lastBroadcastAtBySessionId: Map<string, number> = new Map()
    private readonly lastPersistedActiveAtBySessionId: Map<string, number> = new Map()
    private readonly todoBackfillAttemptedSessionIds: Set<string> = new Set()

    constructor(
        private readonly store: Store,
        private readonly publisher: EventPublisher
    ) {
    }

    private static readonly METADATA_UPDATE_MAX_ATTEMPTS = 3

    private persistSessionAliveState(
        sessionId: string,
        activeAt: number,
        options?: { force?: boolean }
    ): void {
        const lastPersistedActiveAt = this.lastPersistedActiveAtBySessionId.get(sessionId) ?? 0
        if (!options?.force && activeAt - lastPersistedActiveAt < SESSION_ACTIVE_PERSIST_INTERVAL_MS) {
            return
        }

        const persisted = this.store.sessions.setSessionAlive(sessionId, activeAt)
        if (!persisted) {
            return
        }

        this.lastPersistedActiveAtBySessionId.set(sessionId, Math.max(lastPersistedActiveAt, activeAt))
    }

    private persistSessionInactiveState(sessionId: string): void {
        this.store.sessions.setSessionInactive(sessionId)
        this.lastPersistedActiveAtBySessionId.delete(sessionId)
    }

    getSessions(): Session[] {
        return Array.from(this.sessions.values())
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId)
    }

    getActiveSessions(): Session[] {
        return this.getSessions().filter((session) => session.active)
    }

    getOrCreateSession(
        tag: string,
        metadata: unknown,
        agentState: unknown,
        model?: string,
        modelReasoningEffort?: Session['modelReasoningEffort'],
        permissionMode?: PermissionMode,
        collaborationMode?: CodexCollaborationMode,
        sessionId?: string
    ): Session {
        const stored = this.store.sessions.getOrCreateSession(
            tag,
            metadata,
            agentState,
            model,
            modelReasoningEffort ?? undefined,
            permissionMode,
            collaborationMode,
            sessionId
        )
        return this.refreshSession(stored.id) ?? (() => { throw new Error('Failed to load session') })()
    }

    refreshSession(sessionId: string): Session | null {
        let stored = this.store.sessions.getSession(sessionId)
        if (!stored) {
            const existed = this.sessions.delete(sessionId)
            this.lastBroadcastAtBySessionId.delete(sessionId)
            this.lastPersistedActiveAtBySessionId.delete(sessionId)
            this.todoBackfillAttemptedSessionIds.delete(sessionId)
            if (existed) {
                this.publisher.emit({ type: 'session-removed', sessionId })
            }
            return null
        }

        const existing = this.sessions.get(sessionId)

        if (stored.todos === null && !this.todoBackfillAttemptedSessionIds.has(sessionId)) {
            this.todoBackfillAttemptedSessionIds.add(sessionId)
            const messages = this.store.messages.getMessages(sessionId, 200)
            for (let i = messages.length - 1; i >= 0; i -= 1) {
                const message = messages[i]
                const todos = extractTodoWriteTodosFromMessageContent(message.content)
                if (todos) {
                    const updated = this.store.sessions.setSessionTodos(sessionId, todos, message.createdAt)
                    if (updated) {
                        stored = this.store.sessions.getSession(sessionId) ?? stored
                    }
                    break
                }
            }
        }

        const metadata = (() => {
            const parsed = MetadataSchema.safeParse(stored.metadata)
            return parsed.success ? parsed.data : null
        })()

        const agentState = (() => {
            const parsed = AgentStateSchema.safeParse(stored.agentState)
            return parsed.success ? parsed.data : null
        })()

        const todos = (() => {
            if (stored.todos === null) return undefined
            const parsed = TodosSchema.safeParse(stored.todos)
            return parsed.success ? parsed.data : undefined
        })()

        const teamState = (() => {
            if (stored.teamState === null || stored.teamState === undefined) return undefined
            const parsed = TeamStateSchema.safeParse(stored.teamState)
            return parsed.success ? parsed.data : undefined
        })()

        const permissionMode = (() => {
            if (stored.permissionMode === null) return undefined
            const parsed = PermissionModeSchema.safeParse(stored.permissionMode)
            return parsed.success ? parsed.data : undefined
        })()

        const collaborationMode = (() => {
            if (stored.collaborationMode === null) return undefined
            const parsed = CodexCollaborationModeSchema.safeParse(stored.collaborationMode)
            return parsed.success ? parsed.data : undefined
        })()

        const session: Session = {
            id: stored.id,
            seq: stored.seq,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
            active: existing?.active ?? stored.active,
            activeAt: existing?.activeAt ?? (stored.activeAt ?? stored.createdAt),
            metadata,
            metadataVersion: stored.metadataVersion,
            agentState,
            agentStateVersion: stored.agentStateVersion,
            thinking: existing?.thinking ?? false,
            thinkingAt: existing?.thinkingAt ?? 0,
            todos,
            teamState,
            model: stored.model,
            modelReasoningEffort: stored.modelReasoningEffort,
            permissionMode,
            collaborationMode
        }

        this.sessions.set(sessionId, session)
        if (stored.activeAt !== null) {
            this.lastPersistedActiveAtBySessionId.set(sessionId, stored.activeAt)
        } else {
            this.lastPersistedActiveAtBySessionId.delete(sessionId)
        }
        this.publisher.emit({ type: existing ? 'session-updated' : 'session-added', sessionId, data: session })
        return session
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
        permissionMode?: PermissionMode
        model?: string | null
        modelReasoningEffort?: Session['modelReasoningEffort']
        collaborationMode?: CodexCollaborationMode
    }): void {
        const t = clampAliveTime(payload.time)
        if (!t) return

        const session = this.sessions.get(payload.sid) ?? this.refreshSession(payload.sid)
        if (!session) return

        const wasActive = session.active
        const wasThinking = session.thinking
        const previousPermissionMode = session.permissionMode
        const previousModel = session.model
        const previousModelReasoningEffort = session.modelReasoningEffort
        const previousCollaborationMode = session.collaborationMode

        session.active = true
        session.activeAt = Math.max(session.activeAt, t)
        session.thinking = Boolean(payload.thinking)
        session.thinkingAt = t
        this.persistSessionAliveState(payload.sid, session.activeAt, { force: !wasActive })
        if (payload.permissionMode !== undefined) {
            if (payload.permissionMode !== session.permissionMode) {
                this.store.sessions.setSessionPermissionMode(payload.sid, payload.permissionMode)
            }
            session.permissionMode = payload.permissionMode
        }
        if (payload.model !== undefined) {
            if (payload.model !== session.model) {
                this.store.sessions.setSessionModel(payload.sid, payload.model, {
                    touchUpdatedAt: false
                })
            }
            session.model = payload.model
        }
        if (payload.modelReasoningEffort !== undefined) {
            if (payload.modelReasoningEffort !== session.modelReasoningEffort) {
                this.store.sessions.setSessionModelReasoningEffort(payload.sid, payload.modelReasoningEffort, {
                    touchUpdatedAt: false
                })
            }
            session.modelReasoningEffort = payload.modelReasoningEffort
        }
        if (payload.collaborationMode !== undefined) {
            if (payload.collaborationMode !== session.collaborationMode) {
                this.store.sessions.setSessionCollaborationMode(payload.sid, payload.collaborationMode)
            }
            session.collaborationMode = payload.collaborationMode
        }

        const now = Date.now()
        const lastBroadcastAt = this.lastBroadcastAtBySessionId.get(session.id) ?? 0
        const modeChanged = previousPermissionMode !== session.permissionMode
            || previousModel !== session.model
            || previousModelReasoningEffort !== session.modelReasoningEffort
            || previousCollaborationMode !== session.collaborationMode
        const shouldBroadcast = (!wasActive && session.active)
            || (wasThinking !== session.thinking)
            || modeChanged
            || (now - lastBroadcastAt > SESSION_BROADCAST_THROTTLE_MS)

        if (shouldBroadcast) {
            this.lastBroadcastAtBySessionId.set(session.id, now)
            this.publisher.emit({
                type: 'session-updated',
                sessionId: session.id,
                data: {
                    active: true,
                    activeAt: session.activeAt,
                    thinking: session.thinking,
                    permissionMode: session.permissionMode,
                    model: session.model,
                    modelReasoningEffort: session.modelReasoningEffort,
                    collaborationMode: session.collaborationMode
                }
            })
        }
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        const t = clampAliveTime(payload.time) ?? Date.now()

        const session = this.sessions.get(payload.sid) ?? this.refreshSession(payload.sid)
        if (!session) return

        if (!session.active && !session.thinking) {
            this.persistSessionInactiveState(payload.sid)
            return
        }

        session.active = false
        session.thinking = false
        session.thinkingAt = t
        this.persistSessionInactiveState(payload.sid)

        this.publisher.emit({ type: 'session-updated', sessionId: session.id, data: { active: false, thinking: false } })
    }

    expireInactive(now: number = Date.now()): void {
        for (const session of this.sessions.values()) {
            if (!session.active) continue
            if (now - session.activeAt <= SESSION_INACTIVE_TIMEOUT_MS) continue
            session.active = false
            session.thinking = false
            this.persistSessionInactiveState(session.id)
            this.publisher.emit({ type: 'session-updated', sessionId: session.id, data: { active: false } })
        }
    }

    applySessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            model?: string | null
            modelReasoningEffort?: Session['modelReasoningEffort']
            collaborationMode?: CodexCollaborationMode
        }
    ): void {
        const session = this.sessions.get(sessionId) ?? this.refreshSession(sessionId)
        if (!session) {
            return
        }

        if (config.permissionMode !== undefined) {
            const updated = this.store.sessions.setSessionPermissionMode(sessionId, config.permissionMode)
            const persisted = this.store.sessions.getSession(sessionId)?.permissionMode ?? null
            if (!updated && persisted !== config.permissionMode) {
                throw new Error('Failed to update session permission mode')
            }
            session.permissionMode = config.permissionMode
        }
        if (config.model !== undefined) {
            if (config.model !== session.model) {
                const updated = this.store.sessions.setSessionModel(sessionId, config.model, {
                    touchUpdatedAt: false
                })
                if (!updated) {
                    throw new Error('Failed to update session model')
                }
            }
            session.model = config.model
        }
        if (config.modelReasoningEffort !== undefined) {
            if (config.modelReasoningEffort !== session.modelReasoningEffort) {
                const updated = this.store.sessions.setSessionModelReasoningEffort(sessionId, config.modelReasoningEffort, {
                    touchUpdatedAt: false
                })
                if (!updated) {
                    throw new Error('Failed to update session model reasoning effort')
                }
            }
            session.modelReasoningEffort = config.modelReasoningEffort
        }
        if (config.collaborationMode !== undefined) {
            const updated = this.store.sessions.setSessionCollaborationMode(sessionId, config.collaborationMode)
            const persisted = this.store.sessions.getSession(sessionId)?.collaborationMode ?? null
            if (!updated && persisted !== config.collaborationMode) {
                throw new Error('Failed to update session collaboration mode')
            }
            session.collaborationMode = config.collaborationMode
        }

        this.publisher.emit({ type: 'session-updated', sessionId, data: session })
    }

    async mutateSessionMetadata(
        sessionId: string,
        buildNextMetadata: (currentMetadata: Metadata) => Metadata,
        options?: { touchUpdatedAt?: boolean }
    ): Promise<Session> {
        return this.commitMetadataMutation(sessionId, buildNextMetadata, options)
    }

    async renameSession(sessionId: string, name: string): Promise<Session> {
        return this.mutateSessionMetadata(sessionId, (currentMetadata) => ({
            ...currentMetadata,
            name
        }), { touchUpdatedAt: false })
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
        this.mutateSessionMetadata(sessionId, (currentMetadata) => {
            return buildLifecycleMetadata(currentMetadata, lifecycleState, options)
        }, { touchUpdatedAt: options?.touchUpdatedAt })
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
        const cachedSession = this.sessions.get(sessionId) ?? this.refreshSession(sessionId)
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

        return this.commitMetadataMutation(sessionId, (currentMetadata) => {
            return buildLifecycleMetadata(currentMetadata, lifecycleState, options)
        }, { touchUpdatedAt: options?.touchUpdatedAt })
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

        this.sessions.delete(sessionId)
        this.lastBroadcastAtBySessionId.delete(sessionId)
        this.lastPersistedActiveAtBySessionId.delete(sessionId)
        this.todoBackfillAttemptedSessionIds.delete(sessionId)

        this.publisher.emit({ type: 'session-removed', sessionId })
    }

    private commitMetadataMutation(
        sessionId: string,
        buildNextMetadata: (currentMetadata: Metadata) => Metadata,
        options?: { touchUpdatedAt?: boolean }
    ): Session {
        const cachedSession = this.sessions.get(sessionId) ?? this.refreshSession(sessionId)
        if (!cachedSession) {
            throw new Error('Session not found')
        }

        const fallbackMetadata = cachedSession.metadata ?? { path: '', host: '' }
        for (let attempt = 0; attempt < SessionCache.METADATA_UPDATE_MAX_ATTEMPTS; attempt += 1) {
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

function buildLifecycleMetadata(
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
            archiveReason: undefined
        }
    }

    return {
        ...metadata,
        lifecycleState,
        lifecycleStateSince: Date.now(),
        archivedBy: options?.archivedBy ?? 'web',
        archiveReason: options?.archiveReason ?? 'Archived by user'
    }
}
