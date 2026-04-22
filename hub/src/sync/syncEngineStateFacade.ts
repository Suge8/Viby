import {
    findNextRecoveryCursor,
    getSessionActivityKind,
    getSessionMessageActivityFromSession,
    mergeSessionMessageActivity,
    shouldMessageAdvanceSessionUpdatedAt,
} from '@viby/protocol'
import type {
    DecryptedMessage,
    Session,
    SessionMessageActivity,
    SessionRecoveryPage,
    SyncEvent,
} from '@viby/protocol/types'
import { type Machine, MachineCache } from './machineCache'
import { MessageService } from './messageService'
import { SessionCache } from './sessionCache'
import { SessionHandoffService } from './sessionHandoffService'

type GetOrCreateSessionOptions = Parameters<SessionCache['getOrCreateSession']>[0]

export class SyncEngineStateFacade {
    constructor(
        private readonly sessionCache: SessionCache,
        private readonly machineCache: MachineCache,
        private readonly messageService: MessageService,
        private readonly sessionHandoffService: SessionHandoffService,
        private readonly emitEvent: (event: SyncEvent) => void
    ) {}

    getSessions(): Session[] {
        return this.sessionCache.getSessions()
    }

    getSessionsRevision(): number {
        return this.sessionCache.getSessionsRevision()
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId) ?? undefined
    }

    getActiveSessions(): Session[] {
        return this.sessionCache.getActiveSessions()
    }

    getMachines(): Machine[] {
        return this.machineCache.getMachines()
    }

    getMachine(machineId: string): Machine | undefined {
        return this.machineCache.getMachine(machineId)
    }

    getOnlineMachines(): Machine[] {
        return this.machineCache.getOnlineMachines()
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }) {
        return this.messageService.getMessagesPage(sessionId, options)
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        return this.messageService.getMessagesAfter(sessionId, options)
    }

    getSessionRecoveryPage(sessionId: string, options: { afterSeq: number; limit: number }): SessionRecoveryPage {
        const session = this.getSession(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }

        const messages = this.messageService.getMessagesAfter(sessionId, options)
        const nextAfterSeq = findNextRecoveryCursor(messages, options.afterSeq)

        return {
            session,
            messages,
            page: {
                afterSeq: options.afterSeq,
                nextAfterSeq,
                limit: options.limit,
                hasMore: messages.length >= options.limit,
            },
        }
    }

    buildSessionHandoff(sessionId: string) {
        return this.sessionHandoffService.buildSessionHandoff(sessionId)
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return this.messageService.getSessionMessageActivities(sessionIds)
    }

    handleRealtimeEvent(event: SyncEvent): void {
        if (event.type === 'session-updated' && event.sessionId) {
            this.sessionCache.refreshSession(event.sessionId)
            return
        }

        if (event.type === 'machine-updated' && event.machineId) {
            this.machineCache.refreshMachine(event.machineId)
            return
        }

        if (event.type === 'message-received' && event.sessionId) {
            const cachedSession = this.sessionCache.getSession(event.sessionId)
            const activityKind = getSessionActivityKind(event.message.content)
            if (!cachedSession) {
                this.sessionCache.refreshSession(event.sessionId)
            } else {
                const nextActivity = mergeSessionMessageActivity(
                    getSessionMessageActivityFromSession(cachedSession),
                    event.message
                )
                cachedSession.latestActivityAt = nextActivity.latestActivityAt
                cachedSession.latestActivityKind = nextActivity.latestActivityKind
                cachedSession.latestCompletedReplyAt = nextActivity.latestCompletedReplyAt
            }

            if (!cachedSession || shouldMessageAdvanceSessionUpdatedAt(activityKind)) {
                if (cachedSession && shouldMessageAdvanceSessionUpdatedAt(activityKind)) {
                    cachedSession.updatedAt = Math.max(cachedSession.updatedAt, event.message.createdAt)
                }
                this.sessionCache.refreshSession(event.sessionId)
            }
        }

        this.emitEvent(event)
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
        this.sessionCache.handleSessionAlive(payload)
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        this.sessionCache.handleSessionEnd(payload)
    }

    handleMachineAlive(payload: { machineId: string; time: number }): void {
        this.machineCache.handleMachineAlive(payload)
    }

    expireInactive(): void {
        this.sessionCache.expireInactive()
        this.machineCache.expireInactive()
    }

    reloadAll(): void {
        this.sessionCache.reloadAll()
        this.machineCache.reloadAll()
    }

    getOrCreateSession(options: GetOrCreateSessionOptions): Session {
        return this.sessionCache.getOrCreateSession(options)
    }

    getOrCreateMachine(id: string, metadata: unknown, runnerState: unknown): Machine {
        return this.machineCache.getOrCreateMachine(id, metadata, runnerState)
    }
}
