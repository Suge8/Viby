import type { ApiClient, ApiSessionClient } from '@/lib';
import type { MessageQueue2 } from '@/utils/MessageQueue2';
import type {
    SessionCollaborationMode,
    SessionModel,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    WritableSessionMetadata
} from '@/api/types';
import { logger } from '@/ui/logger';

const KEEP_ALIVE_BUSY_INTERVAL_MS = 2_000;
const KEEP_ALIVE_IDLE_INTERVAL_MS = 10_000;

export type AgentSessionBaseOptions<Mode> = {
    api: ApiClient;
    client: ApiSessionClient;
    path: string;
    logPath: string;
    sessionId: string | null;
    messageQueue: MessageQueue2<Mode>;
    onModeChange: (mode: 'local' | 'remote') => void;
    mode?: 'local' | 'remote';
    sessionLabel: string;
    sessionIdLabel: string;
    applySessionIdToMetadata: (metadata: WritableSessionMetadata, sessionId: string) => WritableSessionMetadata;
    permissionMode?: SessionPermissionMode;
    model?: SessionModel;
    modelReasoningEffort?: SessionModelReasoningEffort;
    collaborationMode?: SessionCollaborationMode;
};

export class AgentSessionBase<Mode> {
    readonly path: string;
    readonly logPath: string;
    readonly api: ApiClient;
    readonly client: ApiSessionClient;
    readonly queue: MessageQueue2<Mode>;
    protected readonly _onModeChange: (mode: 'local' | 'remote') => void;

    sessionId: string | null;
    mode: 'local' | 'remote' = 'local';
    thinking: boolean = false;

    private readonly sessionFoundCallbacks: Array<(sessionId: string) => void> = [];
    private readonly applySessionIdToMetadata: (metadata: WritableSessionMetadata, sessionId: string) => WritableSessionMetadata;
    private readonly sessionLabel: string;
    private readonly sessionIdLabel: string;
    private keepAliveTimer: NodeJS.Timeout | null = null;
    protected permissionMode?: SessionPermissionMode;
    protected model?: SessionModel;
    protected modelReasoningEffort?: SessionModelReasoningEffort;
    protected collaborationMode?: SessionCollaborationMode;

    constructor(opts: AgentSessionBaseOptions<Mode>) {
        this.path = opts.path;
        this.api = opts.api;
        this.client = opts.client;
        this.logPath = opts.logPath;
        this.sessionId = opts.sessionId;
        this.queue = opts.messageQueue;
        this._onModeChange = opts.onModeChange;
        this.applySessionIdToMetadata = opts.applySessionIdToMetadata;
        this.sessionLabel = opts.sessionLabel;
        this.sessionIdLabel = opts.sessionIdLabel;
        this.mode = opts.mode ?? 'local';
        this.permissionMode = opts.permissionMode;
        this.model = opts.model;
        this.modelReasoningEffort = opts.modelReasoningEffort;
        this.collaborationMode = opts.collaborationMode;

        this.flushKeepAlive();

    }

    onThinkingChange = (thinking: boolean) => {
        this.thinking = thinking;
        this.flushKeepAlive();
    };

    onModeChange = (mode: 'local' | 'remote') => {
        this.mode = mode;
        this.flushKeepAlive();
        const permissionLabel = this.permissionMode ?? 'unset';
        const modelLabel = this.model === undefined ? 'unset' : (this.model ?? 'auto');
        const reasoningLabel = this.modelReasoningEffort === undefined ? 'unset' : (this.modelReasoningEffort ?? 'auto');
        const collaborationLabel = this.collaborationMode ?? 'unset';
        logger.debug(
            `[${this.sessionLabel}] Mode switched to ${mode} ` +
            `(permissionMode=${permissionLabel}, model=${modelLabel}, reasoningEffort=${reasoningLabel}, collaborationMode=${collaborationLabel})`
        );
        this._onModeChange(mode);
    };

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

    private bindSessionId = (sessionId: string | null | undefined): boolean => {
        const normalizedSessionId = this.normalizeSessionId(sessionId)
        if (!normalizedSessionId) {
            logger.debug(`[${this.sessionLabel}] Ignored malformed ${this.sessionIdLabel} session ID update`, sessionId)
            return false
        }

        const previousSessionId = this.sessionId;
        const sessionIdChanged = previousSessionId !== normalizedSessionId;
        const shouldSyncMetadata = sessionIdChanged || this.shouldSyncSessionIdMetadata(normalizedSessionId);

        if (!shouldSyncMetadata) {
            return false;
        }

        this.sessionId = normalizedSessionId;
        this.client.updateMetadata((metadata) => this.applySessionIdToMetadata(metadata, normalizedSessionId), {
            touchUpdatedAt: false
        });
        const transitionLabel = sessionIdChanged && previousSessionId
            ? `${previousSessionId} -> ${normalizedSessionId}`
            : normalizedSessionId;
        logger.debug(`[${this.sessionLabel}] ${this.sessionIdLabel} session ID synced to metadata: ${transitionLabel}`);
        return sessionIdChanged;
    };

    onSessionFound = (sessionId: string | null | undefined) => {
        const normalizedSessionId = this.normalizeSessionId(sessionId)
        if (!normalizedSessionId) {
            return
        }

        this.bindSessionId(normalizedSessionId);

        for (const callback of this.sessionFoundCallbacks) {
            callback(normalizedSessionId);
        }
    };

    addSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        this.sessionFoundCallbacks.push(callback);
    };

    removeSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        const index = this.sessionFoundCallbacks.indexOf(callback);
        if (index !== -1) {
            this.sessionFoundCallbacks.splice(index, 1);
        }
    };

    stopKeepAlive = (): void => {
        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    };

    protected notifyKeepAliveRuntimeChanged(): void {
        this.flushKeepAlive();
    }

    private emitKeepAlive(): void {
        this.client.keepAlive(this.thinking, this.mode, this.getKeepAliveRuntime());
    }

    private flushKeepAlive(): void {
        this.emitKeepAlive();
        this.scheduleNextKeepAlive();
    }

    private scheduleNextKeepAlive(): void {
        this.stopKeepAlive();
        const intervalMs = this.thinking ? KEEP_ALIVE_BUSY_INTERVAL_MS : KEEP_ALIVE_IDLE_INTERVAL_MS;
        this.keepAliveTimer = setTimeout(() => {
            this.emitKeepAlive();
            this.scheduleNextKeepAlive();
        }, intervalMs);
        this.keepAliveTimer.unref?.();
    }

    protected getKeepAliveRuntime():
        {
            permissionMode?: SessionPermissionMode
            model?: SessionModel
            modelReasoningEffort?: SessionModelReasoningEffort
            collaborationMode?: SessionCollaborationMode
        } | undefined {
        if (
            this.permissionMode === undefined
            && this.model === undefined
            && this.modelReasoningEffort === undefined
            && this.collaborationMode === undefined
        ) {
            return undefined;
        }
        return {
            permissionMode: this.permissionMode,
            model: this.model,
            modelReasoningEffort: this.modelReasoningEffort,
            collaborationMode: this.collaborationMode
        };
    }

    getPermissionMode(): SessionPermissionMode | undefined {
        return this.permissionMode;
    }

    getModel(): SessionModel | undefined {
        return this.model;
    }

    getCollaborationMode(): SessionCollaborationMode | undefined {
        return this.collaborationMode;
    }

    getModelReasoningEffort(): SessionModelReasoningEffort | undefined {
        return this.modelReasoningEffort;
    }
}
