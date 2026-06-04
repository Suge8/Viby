import {
    extractAssistantTurnId,
    type ProviderAdapterRuntimeEvent,
    ProviderAdapterRuntimeEventSchema,
} from '@viby/protocol'
import type { ProviderAdapterInput } from '@viby/protocol/providerAdapterProtocol'
import type { Store } from '../store'
import type { EventPublisher } from '../sync/eventPublisher'
import type { MessageService } from '../sync/messageService'
import type { SessionCache } from '../sync/sessionCache'
import type { SessionStreamManager } from '../sync/sessionStreamManager'
import { mergeRuntimeMetadataWithSessionOwnedFields } from './runtimeMetadataMerge'

type RuntimeEventIngestorOptions = {
    store: Store
    eventPublisher: EventPublisher
    messageService: MessageService
    sessionCache: SessionCache
    sessionStreamManager: SessionStreamManager
    markRuntimeStopping: (sessionId: string, reason?: 'idle-timeout' | 'user-request' | 'shutdown') => void
    getRuntimeStoppingReason: (sessionId: string) => 'idle-timeout' | 'user-request' | 'shutdown' | undefined
}

type RequestResult = Extract<ProviderAdapterInput, { type: 'runtime.metadata-result' | 'runtime.agent-state-result' }>

export class RuntimeEventIngestor {
    constructor(private readonly options: RuntimeEventIngestorOptions) {}

    async ingest(rawEvent: ProviderAdapterRuntimeEvent): Promise<RequestResult | null> {
        const event = ProviderAdapterRuntimeEventSchema.parse(rawEvent)
        switch (event.type) {
            case 'runtime.message':
                await this.ingestMessage(event)
                return null
            case 'runtime.stream-update':
                this.ingestStreamUpdate(event.update)
                return null
            case 'runtime.messages-consumed':
                await this.options.messageService.markMessagesInvoked(event.sessionId, event.localIds)
                return null
            case 'runtime.messages-canceled':
                await this.options.messageService.cancelQueuedMessages(event.sessionId, event.localIds)
                return null
            case 'runtime.session-alive':
                this.ingestSessionAlive(event.payload)
                return null
            case 'runtime.session-runtime-state':
                this.options.markRuntimeStopping(event.payload.sid, event.payload.reason)
                return null
            case 'runtime.session-end':
                this.ingestSessionEnd(event.sessionId, event.time)
                return null
            case 'runtime.metadata-update':
                return this.ingestMetadataUpdate(event)
            case 'runtime.agent-state-update':
                return this.ingestAgentStateUpdate(event)
            case 'runtime.command-capabilities-invalidated':
                this.options.eventPublisher.emit({
                    type: 'command-capabilities-invalidated',
                    sessionId: event.sessionId,
                })
                return null
            default:
                return null
        }
    }

    private async ingestMessage(
        event: Extract<ProviderAdapterRuntimeEvent, { type: 'runtime.message' }>
    ): Promise<void> {
        const assistantTurnId = extractAssistantTurnId(event.message)
        if (assistantTurnId) this.options.sessionStreamManager.drop(event.sessionId, assistantTurnId)
        await this.options.messageService.appendRuntimeMessage(event.sessionId, event.message, event.localId)
    }

    private ingestStreamUpdate(
        update: Extract<ProviderAdapterRuntimeEvent, { type: 'runtime.stream-update' }>['update']
    ): void {
        const event = this.options.sessionStreamManager.applyUpdate(update.sid, update)
        if (event) this.options.eventPublisher.emit(event)
    }

    private ingestSessionAlive(
        payload: Extract<ProviderAdapterRuntimeEvent, { type: 'runtime.session-alive' }>['payload']
    ): void {
        this.options.sessionCache.handleSessionAlive(payload as Parameters<SessionCache['handleSessionAlive']>[0])
    }

    private ingestSessionEnd(sessionId: string, time: number): void {
        const queued = this.options.store.messages.getUninvokedLocalMessages(sessionId)
        const localIds = queued
            .map((message) => message.localId)
            .filter((localId): localId is string => Boolean(localId))
        if (localIds.length > 0) {
            this.options.store.messages.markMessagesInvoked(sessionId, localIds, Date.now())
            this.options.eventPublisher.emit({ type: 'messages-consumed', sessionId, localIds, invokedAt: Date.now() })
        }
        const streamEvent = this.options.sessionStreamManager.clear(sessionId)
        if (streamEvent) this.options.eventPublisher.emit(streamEvent)
        const stopReason = this.options.getRuntimeStoppingReason(sessionId)
        if (stopReason === 'idle-timeout' || stopReason === 'shutdown') {
            this.options.sessionCache.commitSessionLifecycleState(sessionId, 'open', { touchUpdatedAt: false })
        }
        this.options.sessionCache.handleSessionEnd({ sid: sessionId, time })
    }

    private ingestMetadataUpdate(
        event: Extract<ProviderAdapterRuntimeEvent, { type: 'runtime.metadata-update' }>
    ): RequestResult {
        const current = this.options.store.sessions.getSession(event.sessionId)
        if (!current)
            return { type: 'runtime.metadata-result', requestId: event.requestId, result: 'error', error: 'not-found' }
        const metadata = mergeRuntimeMetadataWithSessionOwnedFields(current.metadata, event.metadata)
        const result = this.options.store.sessions.updateSessionMetadata(
            event.sessionId,
            metadata,
            event.expectedVersion,
            {
                touchUpdatedAt: event.touchUpdatedAt,
            }
        )
        if (result.result === 'success') this.options.sessionCache.refreshSession(event.sessionId)
        if (result.result === 'error') {
            return {
                type: 'runtime.metadata-result',
                requestId: event.requestId,
                result: 'error',
                error: 'update-failed',
            }
        }
        return {
            type: 'runtime.metadata-result',
            requestId: event.requestId,
            result: result.result,
            version: result.version,
            value: result.value,
        }
    }

    private ingestAgentStateUpdate(
        event: Extract<ProviderAdapterRuntimeEvent, { type: 'runtime.agent-state-update' }>
    ): RequestResult {
        const result = this.options.store.sessions.updateSessionAgentState(
            event.sessionId,
            event.agentState,
            event.expectedVersion
        )
        if (result.result === 'success') this.options.sessionCache.refreshSession(event.sessionId)
        if (result.result === 'error') {
            return {
                type: 'runtime.agent-state-result',
                requestId: event.requestId,
                result: 'error',
                error: 'update-failed',
            }
        }
        return {
            type: 'runtime.agent-state-result',
            requestId: event.requestId,
            result: result.result,
            version: result.version,
            value: result.value,
        }
    }
}
