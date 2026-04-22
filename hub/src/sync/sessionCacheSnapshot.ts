import {
    AgentStateSchema,
    CodexCollaborationModeSchema,
    MetadataSchema,
    PermissionModeSchema,
} from '@viby/protocol/schemas'
import type { CodexCollaborationMode, PermissionMode, Session } from '@viby/protocol/types'
import type { Store } from '../store'
import { extractTodoWriteTodosFromMessageContent, TodosSchema } from './todos'

type RefreshSessionSnapshotOptions = {
    store: Store
    sessionId: string
    sessions: Map<string, Session>
    lastBroadcastAtBySessionId: Map<string, number>
    lastPersistedActiveAtBySessionId: Map<string, number>
    todoBackfillAttemptedSessionIds: Set<string>
    emit: (event: {
        type: 'session-added' | 'session-updated' | 'session-removed'
        sessionId: string
        data?: Session
    }) => void
}

function backfillSessionTodos(
    store: Store,
    sessionId: string,
    todoBackfillAttemptedSessionIds: Set<string>,
    stored: ReturnType<Store['sessions']['getSession']>
): NonNullable<ReturnType<Store['sessions']['getSession']>> {
    if (!stored || stored.todos !== null || todoBackfillAttemptedSessionIds.has(sessionId)) {
        return stored as NonNullable<typeof stored>
    }

    todoBackfillAttemptedSessionIds.add(sessionId)
    const messages = store.messages.getMessages(sessionId, 200)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i]
        const todos = extractTodoWriteTodosFromMessageContent(message.content)
        if (!todos) {
            continue
        }

        const updated = store.sessions.setSessionTodos(sessionId, todos, message.createdAt)
        if (updated) {
            return store.sessions.getSession(sessionId) ?? stored
        }
        break
    }

    return stored
}

function hydrateSessionSnapshot(
    store: Store,
    stored: NonNullable<ReturnType<Store['sessions']['getSession']>>,
    existing: Session | undefined
): Session {
    const metadata = (() => {
        const parsed = MetadataSchema.safeParse(stored.metadata)
        return parsed.success ? parsed.data : null
    })()

    const agentState = (() => {
        const parsed = AgentStateSchema.safeParse(stored.agentState)
        return parsed.success ? parsed.data : null
    })()

    const todos = (() => {
        if (stored.todos === null) {
            return undefined
        }
        const parsed = TodosSchema.safeParse(stored.todos)
        return parsed.success ? parsed.data : undefined
    })()

    const permissionMode = (() => {
        if (stored.permissionMode === null) {
            return undefined
        }
        const parsed = PermissionModeSchema.safeParse(stored.permissionMode)
        return parsed.success ? parsed.data : undefined
    })()

    const collaborationMode = (() => {
        if (stored.collaborationMode === null) {
            return undefined
        }
        const parsed = CodexCollaborationModeSchema.safeParse(stored.collaborationMode)
        return parsed.success ? parsed.data : undefined
    })()

    return {
        id: stored.id,
        seq: stored.seq,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        active: stored.active,
        activeAt: stored.activeAt ?? existing?.activeAt ?? stored.createdAt,
        metadata,
        metadataVersion: stored.metadataVersion,
        agentState,
        agentStateVersion: stored.agentStateVersion,
        thinking: stored.active ? (existing?.thinking ?? false) : false,
        thinkingAt: stored.active ? (existing?.thinkingAt ?? 0) : 0,
        todos,
        model: stored.model,
        modelReasoningEffort: stored.modelReasoningEffort,
        permissionMode: permissionMode as PermissionMode | undefined,
        collaborationMode: collaborationMode as CodexCollaborationMode | undefined,
        latestActivityAt: stored.latestActivityAt,
        latestActivityKind: stored.latestActivityKind,
        latestCompletedReplyAt: stored.latestCompletedReplyAt,
    }
}

export function refreshSessionSnapshot(options: RefreshSessionSnapshotOptions): Session | null {
    let stored = options.store.sessions.getSession(options.sessionId)
    if (!stored) {
        const existed = options.sessions.delete(options.sessionId)
        options.lastBroadcastAtBySessionId.delete(options.sessionId)
        options.lastPersistedActiveAtBySessionId.delete(options.sessionId)
        options.todoBackfillAttemptedSessionIds.delete(options.sessionId)
        if (existed) {
            options.emit({ type: 'session-removed', sessionId: options.sessionId })
        }
        return null
    }

    stored = backfillSessionTodos(options.store, options.sessionId, options.todoBackfillAttemptedSessionIds, stored)

    const existing = options.sessions.get(options.sessionId)
    const session = hydrateSessionSnapshot(options.store, stored, existing)

    options.sessions.set(options.sessionId, session)
    if (stored.activeAt !== null) {
        options.lastPersistedActiveAtBySessionId.set(options.sessionId, stored.activeAt)
    } else {
        options.lastPersistedActiveAtBySessionId.delete(options.sessionId)
    }

    options.emit({
        type: existing ? 'session-updated' : 'session-added',
        sessionId: options.sessionId,
        data: session,
    })
    return session
}
