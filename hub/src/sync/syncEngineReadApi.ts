import type {
    CodexCollaborationMode,
    DecryptedMessage,
    PermissionMode,
    Session,
    SessionMessageActivity,
    SessionRecoveryPage,
    SyncEvent,
} from '@viby/protocol/types'
import type { SyncEventListener } from './eventPublisher'
import type { Machine } from './machineCache'
import type { SessionCache } from './sessionCache'
import type { SyncEngineServices } from './syncEngineServiceFactory'

export type SyncEngineGetOrCreateSessionOptions = Parameters<SessionCache['getOrCreateSession']>[0]

export type SyncEngineSessionAlivePayload = {
    sid: string
    time: number
    thinking?: boolean
    mode?: 'local' | 'remote'
    permissionMode?: PermissionMode
    model?: string | null
    modelReasoningEffort?: Session['modelReasoningEffort']
    codexServiceTier?: Session['codexServiceTier']
    collaborationMode?: CodexCollaborationMode
}

export abstract class SyncEngineReadApi {
    protected abstract get syncServices(): SyncEngineServices

    subscribe(listener: SyncEventListener): () => void {
        return this.syncServices.eventPublisher.subscribe(listener)
    }

    getSessions(): Session[] {
        return this.syncServices.stateFacade.getSessions()
    }

    getSessionsRevision(): number {
        return this.syncServices.stateFacade.getSessionsRevision()
    }

    getSession(sessionId: string): Session | undefined {
        return this.syncServices.stateFacade.getSession(sessionId)
    }

    getActiveSessions(): Session[] {
        return this.syncServices.stateFacade.getActiveSessions()
    }

    getMachines(): Machine[] {
        return this.syncServices.stateFacade.getMachines()
    }

    getMachine(machineId: string): Machine | undefined {
        return this.syncServices.stateFacade.getMachine(machineId)
    }

    getOnlineMachines(): Machine[] {
        return this.syncServices.stateFacade.getOnlineMachines()
    }

    getMessagesPage(
        sessionId: string,
        options: { limit: number; beforeSeq: number | null }
    ): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        return this.syncServices.stateFacade.getMessagesPage(sessionId, options)
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        return this.syncServices.stateFacade.getMessagesAfter(sessionId, options)
    }

    getSessionRecoveryPage(sessionId: string, options: { afterSeq: number; limit: number }): SessionRecoveryPage {
        return this.syncServices.stateFacade.getSessionRecoveryPage(sessionId, options)
    }

    buildSessionHandoff(sessionId: string) {
        return this.syncServices.stateFacade.buildSessionHandoff(sessionId)
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return this.syncServices.stateFacade.getSessionMessageActivities(sessionIds)
    }

    handleRealtimeEvent(event: SyncEvent): void {
        this.syncServices.stateFacade.handleRealtimeEvent(event)
    }

    handleSessionAlive(payload: SyncEngineSessionAlivePayload): void {
        this.syncServices.stateFacade.handleSessionAlive(payload)
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        const stopReason = this.syncServices.sessionRuntimeStateService.getStoppingReason(payload.sid)
        if (stopReason === 'idle-timeout' || stopReason === 'shutdown') {
            this.syncServices.sessionCache.commitSessionLifecycleState(payload.sid, 'open', { touchUpdatedAt: false })
        }
        this.syncServices.stateFacade.handleSessionEnd(payload)
    }

    handleSessionRuntimeStopping(sessionId: string, reason?: 'idle-timeout' | 'user-request' | 'shutdown'): void {
        this.syncServices.sessionRuntimeStateService.markStopping(sessionId, reason)
    }

    handleMachineAlive(payload: { machineId: string; time: number }): void {
        this.syncServices.stateFacade.handleMachineAlive(payload)
    }

    getOrCreateSession(options: SyncEngineGetOrCreateSessionOptions): Session {
        return this.syncServices.stateFacade.getOrCreateSession(options)
    }

    getOrCreateMachine(id: string, metadata: unknown, runtimeState: unknown): Machine {
        return this.syncServices.stateFacade.getOrCreateMachine(id, metadata, runtimeState)
    }

    updateMachineMetadata(id: string, metadata: unknown): Machine {
        return this.syncServices.stateFacade.updateMachineMetadata(id, metadata)
    }

    updateMachineRuntimeState(id: string, runtimeState: unknown): Machine {
        return this.syncServices.stateFacade.updateMachineRuntimeState(id, runtimeState)
    }

    protected expireInactive(now?: number): void {
        this.syncServices.stateFacade.expireInactive(now)
    }

    protected reloadAll(): void {
        this.syncServices.stateFacade.reloadAll()
    }
}
