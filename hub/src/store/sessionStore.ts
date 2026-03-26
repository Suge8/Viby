import type { Database } from 'bun:sqlite'
import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode
} from '@viby/protocol/types'

import type { StoredSession, VersionedUpdateResult } from './types'
import {
    type CreateStoredSessionInput,
    deleteSession,
    getOrCreateSession,
    getSession,
    getSessions,
    setSessionAlive,
    setSessionCollaborationMode,
    setSessionInactive,
    setSessionModel,
    setSessionModelReasoningEffort,
    setSessionPermissionMode,
    setSessionTeamState,
    setSessionTodos,
    touchSessionUpdatedAt,
    updateSessionAgentState,
    updateSessionMetadata
} from './sessions'

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

    setSessionTeamState(id: string, teamState: unknown, updatedAt: number): boolean {
        return setSessionTeamState(this.db, id, teamState, updatedAt)
    }

    setSessionAlive(id: string, activeAt: number): boolean {
        return setSessionAlive(this.db, id, activeAt)
    }

    setSessionInactive(id: string): boolean {
        return setSessionInactive(this.db, id)
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

    deleteSession(id: string): boolean {
        return deleteSession(this.db, id)
    }
}
