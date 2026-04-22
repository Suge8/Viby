import type {
    SessionCollaborationMode,
    SessionModel,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    WritableSessionMetadata,
} from '@/api/types'
import type { ApiClient, ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import type { MessageQueue2 } from '@/utils/MessageQueue2'

const KEEP_ALIVE_BUSY_INTERVAL_MS = 2_000
const KEEP_ALIVE_IDLE_INTERVAL_MS = 10_000
const DURABLE_METADATA_SYNC_OPTIONS = { touchUpdatedAt: false } as const
type RuntimeStopHandler = (() => Promise<void>) | null

export type AgentSessionBaseOptions<Mode> = {
    api: ApiClient
    client: ApiSessionClient
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
}

export class AgentSessionBase<Mode> {
    readonly path: string
    readonly logPath: string
    readonly api: ApiClient
    readonly client: ApiSessionClient
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
    private keepAliveTimer: NodeJS.Timeout | null = null
    private inFlightSessionIdMetadataSync: { sessionId: string; promise: Promise<void> } | null = null
    private sessionIdMetadataSyncQueue: Promise<void> = Promise.resolve()
    protected permissionMode?: SessionPermissionMode
    protected model?: SessionModel
    protected modelReasoningEffort?: SessionModelReasoningEffort
    protected collaborationMode?: SessionCollaborationMode
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

        this.flushKeepAlive()
    }

    onThinkingChange = (thinking: boolean) => {
        this.thinking = thinking
        this.flushKeepAlive()
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
    }

    async requestRuntimeStop(): Promise<boolean> {
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
        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer)
            this.keepAliveTimer = null
        }
    }

    protected notifyKeepAliveRuntimeChanged(): void {
        this.flushKeepAlive()
    }

    private emitKeepAlive(): void {
        this.client.keepAlive(this.thinking, this.mode, this.getKeepAliveRuntime())
    }

    private flushKeepAlive(): void {
        this.emitKeepAlive()
        this.scheduleNextKeepAlive()
    }

    private scheduleNextKeepAlive(): void {
        this.stopKeepAlive()
        const intervalMs = this.thinking ? KEEP_ALIVE_BUSY_INTERVAL_MS : KEEP_ALIVE_IDLE_INTERVAL_MS
        this.keepAliveTimer = setTimeout(() => {
            this.emitKeepAlive()
            this.scheduleNextKeepAlive()
        }, intervalMs)
        this.keepAliveTimer.unref?.()
    }

    protected getKeepAliveRuntime():
        | {
              permissionMode?: SessionPermissionMode
              model?: SessionModel
              modelReasoningEffort?: SessionModelReasoningEffort
              collaborationMode?: SessionCollaborationMode
          }
        | undefined {
        if (
            this.permissionMode === undefined &&
            this.model === undefined &&
            this.modelReasoningEffort === undefined &&
            this.collaborationMode === undefined
        ) {
            return undefined
        }
        return {
            permissionMode: this.permissionMode,
            model: this.model,
            modelReasoningEffort: this.modelReasoningEffort,
            collaborationMode: this.collaborationMode,
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
