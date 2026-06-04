import type { EventEmitter } from 'node:events'
import type {
    CodexServiceTier,
    SessionCollaborationMode,
    SessionModel,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    WritableSessionMetadata,
} from '@/api/types'
import type { ApiClient, RuntimeSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import type { MessageQueue2 } from '@/utils/MessageQueue2'
import { IdleRuntimeStopController } from './idleRuntimeStopController'
import { KeepAliveController } from './keepAliveController'

export const APP_CORE_IDLE_RUNTIME_STOP_MS = 5 * 60 * 1_000
const DURABLE_METADATA_SYNC_OPTIONS = { touchUpdatedAt: false } as const
type RuntimeStopHandler = (() => Promise<void>) | null
type EventedRuntimeSessionClient = RuntimeSessionClient & { on: EventEmitter['on'] }
type KeepAliveRuntime = Pick<
    AgentSessionBaseOptions<unknown>,
    'permissionMode' | 'model' | 'modelReasoningEffort' | 'collaborationMode' | 'codexServiceTier'
>

export type AgentSessionBaseOptions<Mode> = {
    api: ApiClient
    client: EventedRuntimeSessionClient
    path: string
    logPath: string
    sessionId: string | null
    messageQueue: MessageQueue2<Mode>
    sessionLabel: string
    sessionIdLabel: string
    applySessionIdToMetadata: (metadata: WritableSessionMetadata, sessionId: string) => WritableSessionMetadata
    permissionMode?: SessionPermissionMode
    model?: SessionModel
    modelReasoningEffort?: SessionModelReasoningEffort
    collaborationMode?: SessionCollaborationMode
    codexServiceTier?: CodexServiceTier | null
    startedBy?: 'app-core' | 'terminal'
    idleRuntimeStopMs?: number
}

export class AgentSessionBase<Mode> {
    readonly path: string
    readonly logPath: string
    readonly api: ApiClient
    readonly client: EventedRuntimeSessionClient
    readonly queue: MessageQueue2<Mode>

    sessionId: string | null
    mode: 'remote' = 'remote'
    thinking: boolean = false

    private readonly sessionFoundCallbacks: Array<(sessionId: string) => void> = []
    private readonly applySessionIdToMetadata: (
        metadata: WritableSessionMetadata,
        sessionId: string
    ) => WritableSessionMetadata
    private readonly sessionLabel: string
    private readonly sessionIdLabel: string
    private readonly keepAlive: KeepAliveController
    private readonly idleRuntimeStop: IdleRuntimeStopController
    private inFlightSessionIdMetadataSync: { sessionId: string; promise: Promise<void> } | null = null
    private sessionIdMetadataSyncQueue: Promise<void> = Promise.resolve()
    protected permissionMode?: SessionPermissionMode
    protected model?: SessionModel
    protected modelReasoningEffort?: SessionModelReasoningEffort
    protected collaborationMode?: SessionCollaborationMode
    protected codexServiceTier?: CodexServiceTier | null
    private runtimeStopHandler: RuntimeStopHandler = null
    private runtimeStopInFlight: Promise<void> | null = null

    constructor(opts: AgentSessionBaseOptions<Mode>) {
        this.path = opts.path
        this.api = opts.api
        this.client = opts.client
        this.logPath = opts.logPath
        this.sessionId = opts.sessionId
        this.queue = opts.messageQueue
        this.applySessionIdToMetadata = opts.applySessionIdToMetadata
        this.sessionLabel = opts.sessionLabel
        this.sessionIdLabel = opts.sessionIdLabel
        this.permissionMode = opts.permissionMode
        this.model = opts.model
        this.modelReasoningEffort = opts.modelReasoningEffort
        this.collaborationMode = opts.collaborationMode
        this.codexServiceTier = opts.codexServiceTier
        this.keepAlive = new KeepAliveController({ emit: () => this.emitKeepAlive() })
        this.idleRuntimeStop = new IdleRuntimeStopController({
            delayMs: this.resolveIdleRuntimeStopMs(opts),
            isThinking: () => this.thinking,
            hasStopHandler: () => Boolean(this.runtimeStopHandler),
            hasStopInFlight: () => Boolean(this.runtimeStopInFlight),
            queueSize: () => this.queue.size(),
            requestStop: () => this.requestRuntimeStop(),
            onStopRequest: () => this.logIdleRuntimeStopRequest(),
            onStopError: (error) => this.logIdleRuntimeStopError(error),
        })
        this.queue.onConsumed((localIds) => this.client.emitMessagesConsumed(localIds))
        this.queue.onCanceled((localIds) => this.client.emitMessagesCanceled(localIds))
        this.client.on('cancel-messages', (localIds: string[]) => {
            this.queue.removeByLocalIds(localIds)
            this.idleRuntimeStop.schedule()
        })
        this.queue.onEnqueued(() => this.idleRuntimeStop.cancel())

        this.flushKeepAlive()
    }

    onThinkingChange = (thinking: boolean) => {
        if (thinking) {
            this.idleRuntimeStop.markTurnActive()
        }
        this.thinking = thinking
        this.flushKeepAlive()
        this.idleRuntimeStop.schedule()
    }

    private resolveIdleRuntimeStopMs(opts: AgentSessionBaseOptions<Mode>): number | undefined {
        if (opts.idleRuntimeStopMs !== undefined) {
            return opts.idleRuntimeStopMs
        }
        return opts.startedBy === 'app-core' ? APP_CORE_IDLE_RUNTIME_STOP_MS : undefined
    }

    private logIdleRuntimeStopRequest(): void {
        this.client.sendSessionRuntimeState({ state: 'stopping', reason: 'idle-timeout' })
        logger.debug(`[${this.sessionLabel}] Idle runtime stop requested`, {
            reason: 'idle-timeout',
            sessionId: this.sessionId,
        })
    }

    private logIdleRuntimeStopError(error: unknown): void {
        logger.debug(`[${this.sessionLabel}] Idle runtime stop failed`, {
            reason: 'idle-timeout',
            sessionId: this.sessionId,
            error,
        })
    }

    private shouldSyncSessionIdMetadata(sessionId: string): boolean {
        const currentMetadata = this.client.getMetadataSnapshot()
        if (!currentMetadata) {
            return true
        }

        const nextMetadata = this.applySessionIdToMetadata(currentMetadata, sessionId)
        return JSON.stringify(currentMetadata) !== JSON.stringify(nextMetadata)
    }

    private normalizeSessionId(sessionId: string | null | undefined): string | null {
        if (typeof sessionId !== 'string') {
            return null
        }

        const trimmedSessionId = sessionId.trim()
        return trimmedSessionId.length > 0 ? trimmedSessionId : null
    }

    // Provider session IDs become durable resume tokens only after the Hub acks metadata.
    private persistSessionIdMetadata = (sessionId: string, transitionLabel: string): Promise<void> => {
        if (this.inFlightSessionIdMetadataSync?.sessionId === sessionId) {
            return this.inFlightSessionIdMetadataSync.promise
        }

        const promise = this.sessionIdMetadataSyncQueue
            .catch(() => undefined)
            .then(async () => {
                if (!this.shouldSyncSessionIdMetadata(sessionId)) {
                    logger.debug(
                        `[${this.sessionLabel}] Skipping ${this.sessionIdLabel} metadata sync because the durable session ID is already current`
                    )
                    return
                }

                await this.client.updateMetadataAndWait(
                    (metadata) => this.applySessionIdToMetadata(metadata, sessionId),
                    DURABLE_METADATA_SYNC_OPTIONS
                )
                logger.debug(
                    `[${this.sessionLabel}] ${this.sessionIdLabel} session ID synced to metadata: ${transitionLabel}`
                )
            })
            .finally(() => {
                if (this.inFlightSessionIdMetadataSync?.promise === promise) {
                    this.inFlightSessionIdMetadataSync = null
                }
            })

        this.inFlightSessionIdMetadataSync = { sessionId, promise }
        this.sessionIdMetadataSyncQueue = promise
        return promise
    }

    private bindSessionId = (sessionId: string | null | undefined): Promise<void> | null => {
        const normalizedSessionId = this.normalizeSessionId(sessionId)
        if (!normalizedSessionId) {
            logger.debug(`[${this.sessionLabel}] Ignored malformed ${this.sessionIdLabel} session ID update`, sessionId)
            return null
        }

        const previousSessionId = this.sessionId
        const sessionIdChanged = previousSessionId !== normalizedSessionId
        const shouldSyncMetadata = sessionIdChanged || this.shouldSyncSessionIdMetadata(normalizedSessionId)

        // Keep the latest provider session ID locally, but revert if the Hub never acks it durably.
        this.sessionId = normalizedSessionId
        if (!shouldSyncMetadata) {
            return null
        }

        const transitionLabel =
            sessionIdChanged && previousSessionId
                ? `${previousSessionId} -> ${normalizedSessionId}`
                : normalizedSessionId
        return this.persistSessionIdMetadata(normalizedSessionId, transitionLabel).catch((error) => {
            if (this.sessionId === normalizedSessionId) {
                this.sessionId = previousSessionId
            }
            throw error
        })
    }

    onSessionFound = (sessionId: string | null | undefined) => {
        const normalizedSessionId = this.normalizeSessionId(sessionId)
        if (!normalizedSessionId) {
            return
        }

        const persistPromise = this.bindSessionId(normalizedSessionId)

        for (const callback of this.sessionFoundCallbacks) {
            callback(normalizedSessionId)
        }

        void persistPromise?.catch((error) => {
            logger.debug(
                `[${this.sessionLabel}] Failed to persist ${this.sessionIdLabel} session ID to metadata`,
                error
            )
        })
    }

    addSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        this.sessionFoundCallbacks.push(callback)
    }

    removeSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        const index = this.sessionFoundCallbacks.indexOf(callback)
        if (index !== -1) {
            this.sessionFoundCallbacks.splice(index, 1)
        }
    }

    setRuntimeStopHandler(handler: RuntimeStopHandler): void {
        this.runtimeStopHandler = handler
        if (!handler) {
            this.runtimeStopInFlight = null
        }
        this.idleRuntimeStop.schedule()
    }

    async requestRuntimeStop(): Promise<boolean> {
        this.idleRuntimeStop.cancel()
        if (this.runtimeStopInFlight) {
            await this.runtimeStopInFlight
            return true
        }

        const handler = this.runtimeStopHandler
        if (!handler) {
            return false
        }

        const stopPromise = handler().finally(() => {
            if (this.runtimeStopInFlight === stopPromise) {
                this.runtimeStopInFlight = null
            }
        })
        this.runtimeStopInFlight = stopPromise
        await stopPromise
        return true
    }

    stopKeepAlive = (): void => {
        this.keepAlive.stop()
        this.idleRuntimeStop.cancel()
    }

    protected notifyKeepAliveRuntimeChanged(): void {
        this.flushKeepAlive()
    }

    private emitKeepAlive(): void {
        this.client.keepAlive(this.thinking, this.mode, this.getKeepAliveRuntime())
    }

    private flushKeepAlive(): void {
        this.keepAlive.flush(this.thinking)
    }

    protected getKeepAliveRuntime(): KeepAliveRuntime | undefined {
        if (
            this.permissionMode === undefined &&
            this.model === undefined &&
            this.modelReasoningEffort === undefined &&
            this.collaborationMode === undefined &&
            this.codexServiceTier === undefined
        ) {
            return undefined
        }
        return {
            permissionMode: this.permissionMode,
            model: this.model,
            modelReasoningEffort: this.modelReasoningEffort,
            collaborationMode: this.collaborationMode,
            codexServiceTier: this.codexServiceTier,
        }
    }

    getPermissionMode(): SessionPermissionMode | undefined {
        return this.permissionMode
    }

    getModel(): SessionModel | undefined {
        return this.model
    }

    getCollaborationMode(): SessionCollaborationMode | undefined {
        return this.collaborationMode
    }

    getModelReasoningEffort(): SessionModelReasoningEffort | undefined {
        return this.modelReasoningEffort
    }
}
