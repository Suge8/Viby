import type { ApiClient, ApiSessionClient } from '@/lib';
import type { MessageQueue2 } from '@/utils/MessageQueue2';
import type {
    Metadata,
    SessionCollaborationMode,
    SessionModel,
    SessionModelReasoningEffort,
    SessionPermissionMode
} from '@/api/types';
import { logger } from '@/ui/logger';

const KEEP_ALIVE_INTERVAL_MS = 2_000;

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
    applySessionIdToMetadata: (metadata: Metadata, sessionId: string) => Metadata;
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
    private readonly applySessionIdToMetadata: (metadata: Metadata, sessionId: string) => Metadata;
    private readonly sessionLabel: string;
    private readonly sessionIdLabel: string;
    private keepAliveInterval: NodeJS.Timeout | null = null;
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

        this.emitKeepAlive();
        this.keepAliveInterval = setInterval(() => {
            this.emitKeepAlive();
        }, KEEP_ALIVE_INTERVAL_MS);

    }

    onThinkingChange = (thinking: boolean) => {
        this.thinking = thinking;
        this.emitKeepAlive();
    };

    onModeChange = (mode: 'local' | 'remote') => {
        this.mode = mode;
        this.emitKeepAlive();
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

    private bindSessionId = (sessionId: string): boolean => {
        const previousSessionId = this.sessionId;
        const sessionIdChanged = previousSessionId !== sessionId;
        const shouldSyncMetadata = sessionIdChanged || this.shouldSyncSessionIdMetadata(sessionId);

        if (!shouldSyncMetadata) {
            return false;
        }

        this.sessionId = sessionId;
        this.client.updateMetadata((metadata) => this.applySessionIdToMetadata(metadata, sessionId), {
            touchUpdatedAt: false
        });
        const transitionLabel = sessionIdChanged && previousSessionId
            ? `${previousSessionId} -> ${sessionId}`
            : sessionId;
        logger.debug(`[${this.sessionLabel}] ${this.sessionIdLabel} session ID synced to metadata: ${transitionLabel}`);
        return sessionIdChanged;
    };

    onSessionFound = (sessionId: string) => {
        this.bindSessionId(sessionId);

        for (const callback of this.sessionFoundCallbacks) {
            callback(sessionId);
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
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    };

    private emitKeepAlive(): void {
        this.client.keepAlive(this.thinking, this.mode, this.getKeepAliveRuntime());
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
