import type { CodexCollaborationMode, PermissionMode, Session } from '@viby/protocol/types'
import type { Store } from '../store'
import { clampAliveTime } from './aliveTime'
import {
    applyAlivePresenceConfig,
    buildAlivePresencePatch,
    buildInactivePresencePatch,
    capturePresenceConfig,
    type InactiveLifecyclePatch,
    isPresenceBlockedByArchivedLifecycle,
    type SessionPresencePatch,
    shouldBroadcastAlivePresence,
} from './sessionPresenceSupport'

const SESSION_BROADCAST_THROTTLE_MS = 10_000
const SESSION_ACTIVE_PERSIST_INTERVAL_MS = 10_000
const SESSION_INACTIVE_TIMEOUT_MS = 30_000

type SessionLookup = (sessionId: string) => Session | null | undefined
type EmitSessionUpdate = (sessionId: string, data: SessionPresencePatch) => void
type NormalizeInactiveLifecycle = (sessionId: string) => InactiveLifecyclePatch

export class SessionPresenceService {
    constructor(
        private readonly store: Store,
        private readonly sessions: Map<string, Session>,
        private readonly lastBroadcastAtBySessionId: Map<string, number>,
        private readonly lastPersistedActiveAtBySessionId: Map<string, number>,
        private readonly getSession: SessionLookup,
        private readonly emitSessionUpdate: EmitSessionUpdate,
        private readonly normalizeInactiveLifecycle: NormalizeInactiveLifecycle
    ) {}

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
        const activeAt = clampAliveTime(payload.time)
        if (!activeAt) {
            return
        }

        const session = this.getSession(payload.sid)
        if (!session || isPresenceBlockedByArchivedLifecycle(session)) {
            return
        }

        const wasActive = session.active
        const wasThinking = session.thinking

        session.active = true
        session.activeAt = Math.max(session.activeAt, activeAt)
        session.thinking = Boolean(payload.thinking)
        session.thinkingAt = activeAt
        this.persistSessionAliveState(payload.sid, session.activeAt, { force: !wasActive })
        const previousConfig = applyAlivePresenceConfig({
            store: this.store,
            sessionId: payload.sid,
            session,
            payload,
        })

        const now = Date.now()
        const lastBroadcastAt = this.lastBroadcastAtBySessionId.get(session.id) ?? 0
        const shouldBroadcast = shouldBroadcastAlivePresence({
            wasActive,
            currentActive: session.active,
            wasThinking,
            currentThinking: session.thinking,
            now,
            lastBroadcastAt,
            broadcastThrottleMs: SESSION_BROADCAST_THROTTLE_MS,
            previousConfig,
            currentConfig: capturePresenceConfig(session),
        })

        if (!shouldBroadcast) {
            return
        }

        this.lastBroadcastAtBySessionId.set(session.id, now)
        this.emitSessionUpdate(session.id, buildAlivePresencePatch(session))
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        const transitionAt = clampAliveTime(payload.time) ?? Date.now()
        const session = this.getSession(payload.sid)
        if (!session) {
            return
        }

        if (!session.active && !session.thinking) {
            this.persistSessionInactiveState(payload.sid)
            return
        }

        this.deactivateSession(payload.sid, session, { transitionAt })
    }

    setSessionThinking(sessionId: string, thinking: boolean, transitionAt: number = Date.now()): Session | null {
        const session = this.getSession(sessionId)
        if (!session) {
            return null
        }
        if (session.thinking === thinking) {
            return session
        }

        session.thinking = thinking
        session.thinkingAt = transitionAt
        this.emitSessionUpdate(sessionId, {
            active: session.active,
            activeAt: session.activeAt,
            thinking: session.thinking,
        })
        return session
    }

    expireInactive(now: number = Date.now()): void {
        for (const session of this.sessions.values()) {
            if (!session.active) {
                continue
            }
            if (now - session.activeAt <= SESSION_INACTIVE_TIMEOUT_MS) {
                continue
            }

            this.deactivateSession(session.id, session)
        }
    }

    private persistSessionAliveState(sessionId: string, activeAt: number, options?: { force?: boolean }): void {
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

    private deactivateSession(
        sessionId: string,
        session: Session,
        options: Readonly<{ transitionAt?: number }> = {}
    ): void {
        session.active = false
        session.thinking = false
        if (options.transitionAt !== undefined) {
            session.thinkingAt = options.transitionAt
        }

        this.persistSessionInactiveState(sessionId)
        const lifecyclePatch = this.normalizeInactiveLifecycle(sessionId)
        this.emitSessionUpdate(session.id, buildInactivePresencePatch(lifecyclePatch))
    }
}
