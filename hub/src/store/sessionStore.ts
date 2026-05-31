import type { Database } from 'bun:sqlite'
import type {
    CodexCollaborationMode,
    CodexServiceTier,
    ModelReasoningEffort,
    PermissionMode,
    SessionMessageActivity,
} from '@viby/protocol/types'
import {
    type CreateStoredSessionInput,
    deleteSession,
    getActiveHistorySessionIds,
    getInactiveRunningSessionIds,
    getOrCreateSession,
    getSession,
    getSessionMessageActivities,
    getSessions,
    setSessionAlive,
    setSessionCodexServiceTier,
    setSessionCollaborationMode,
    setSessionInactive,
    setSessionInactiveIfActiveAt,
    setSessionModel,
    setSessionModelReasoningEffort,
    setSessionPermissionMode,
    setSessionTodos,
    touchSessionUpdatedAt,
    updateSessionAgentState,
    updateSessionMetadata,
} from './sessions'
import type { StoredSession, VersionedUpdateResult } from './types'

export class SessionStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getOrCreateSession(input: CreateStoredSessionInput): StoredSession {
        return getOrCreateSession(this.db, input)
    }

    updateSessionMetadata(
        id: string,
        metadata: unknown,
        expectedVersion: number,
        options?: { touchUpdatedAt?: boolean }
    ): VersionedUpdateResult<unknown | null> {
        return updateSessionMetadata(this.db, id, metadata, expectedVersion, options)
    }

    updateSessionAgentState(
        id: string,
        agentState: unknown,
        expectedVersion: number
    ): VersionedUpdateResult<unknown | null> {
        return updateSessionAgentState(this.db, id, agentState, expectedVersion)
    }

    setSessionTodos(id: string, todos: unknown, todosUpdatedAt: number): boolean {
        return setSessionTodos(this.db, id, todos, todosUpdatedAt)
    }

    setSessionAlive(id: string, activeAt: number): boolean {
        return setSessionAlive(this.db, id, activeAt)
    }

    setSessionInactive(id: string): boolean {
        return setSessionInactive(this.db, id)
    }

    setSessionInactiveIfActiveAt(id: string, activeAt: number): boolean {
        return setSessionInactiveIfActiveAt(this.db, id, activeAt)
    }

    setSessionModel(id: string, model: string | null, options?: { touchUpdatedAt?: boolean }): boolean {
        return setSessionModel(this.db, id, model, options)
    }

    setSessionModelReasoningEffort(
        id: string,
        modelReasoningEffort: ModelReasoningEffort | null,
        options?: { touchUpdatedAt?: boolean }
    ): boolean {
        return setSessionModelReasoningEffort(this.db, id, modelReasoningEffort, options)
    }

    setSessionCodexServiceTier(
        id: string,
        codexServiceTier: CodexServiceTier | null,
        options?: { touchUpdatedAt?: boolean }
    ): boolean {
        return setSessionCodexServiceTier(this.db, id, codexServiceTier, options)
    }

    setSessionPermissionMode(id: string, permissionMode: PermissionMode | null): boolean {
        return setSessionPermissionMode(this.db, id, permissionMode)
    }

    setSessionCollaborationMode(id: string, collaborationMode: CodexCollaborationMode | null): boolean {
        return setSessionCollaborationMode(this.db, id, collaborationMode)
    }

    touchSessionUpdatedAt(id: string, updatedAt: number): boolean {
        return touchSessionUpdatedAt(this.db, id, updatedAt)
    }

    getSession(id: string): StoredSession | null {
        return getSession(this.db, id)
    }

    getSessions(): StoredSession[] {
        return getSessions(this.db)
    }

    getInactiveRunningSessionIds(): string[] {
        return getInactiveRunningSessionIds(this.db)
    }

    getActiveHistorySessionIds(): string[] {
        return getActiveHistorySessionIds(this.db)
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return getSessionMessageActivities(this.db, sessionIds)
    }

    deleteSession(id: string): boolean {
        return deleteSession(this.db, id)
    }
}
