import { ApiClient, ApiSessionClient } from '@/lib';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { AgentSessionBase } from '@/agent/sessionBase';
import type { GeminiMode, PermissionMode } from './types';
import type { LocalLaunchExitReason } from '@/agent/localLaunchPolicy';
import { buildVibyMcpBridge, type VibyMcpBridge } from '@/codex/utils/buildVibyMcpBridge';
import { createGeminiBackend } from './utils/geminiBackend';

type LocalLaunchFailure = {
    message: string;
    exitReason: LocalLaunchExitReason;
};

type GeminiBackend = ReturnType<typeof createGeminiBackend>;

export class GeminiSession extends AgentSessionBase<GeminiMode> {
    transcriptPath: string | null = null;
    readonly startedBy: 'runner' | 'terminal';
    readonly startingMode: 'local' | 'remote';
    localLaunchFailure: LocalLaunchFailure | null = null;

    private transcriptPathCallbacks: Array<(path: string) => void> = [];
    private remoteBridge: VibyMcpBridge | null = null;
    private remoteBackend: GeminiBackend | null = null;
    private remoteBackendKey: string | null = null;

    constructor(opts: {
        api: ApiClient;
        client: ApiSessionClient;
        path: string;
        logPath: string;
        sessionId: string | null;
        messageQueue: MessageQueue2<GeminiMode>;
        onModeChange: (mode: 'local' | 'remote') => void;
        mode?: 'local' | 'remote';
        startedBy: 'runner' | 'terminal';
        startingMode: 'local' | 'remote';
        permissionMode?: PermissionMode;
    }) {
        super({
            api: opts.api,
            client: opts.client,
            path: opts.path,
            logPath: opts.logPath,
            sessionId: opts.sessionId,
            messageQueue: opts.messageQueue,
            onModeChange: opts.onModeChange,
            mode: opts.mode,
            sessionLabel: 'GeminiSession',
            sessionIdLabel: 'Gemini',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                geminiSessionId: sessionId
            }),
            permissionMode: opts.permissionMode
        });

        this.startedBy = opts.startedBy;
        this.startingMode = opts.startingMode;
        this.permissionMode = opts.permissionMode;
    }

    onTranscriptPathFound(path: string): void {
        if (this.transcriptPath === path) {
            return;
        }
        this.transcriptPath = path;
        for (const callback of this.transcriptPathCallbacks) {
            callback(path);
        }
    }

    addTranscriptPathCallback(cb: (path: string) => void): void {
        this.transcriptPathCallbacks.push(cb);
    }

    removeTranscriptPathCallback(cb: (path: string) => void): void {
        const index = this.transcriptPathCallbacks.indexOf(cb);
        if (index !== -1) {
            this.transcriptPathCallbacks.splice(index, 1);
        }
    }

    setPermissionMode = (mode: PermissionMode): void => {
        this.permissionMode = mode;
        this.notifyKeepAliveRuntimeChanged();
    };

    setModel = (model: string | null): void => {
        this.model = model;
        this.notifyKeepAliveRuntimeChanged();
    };

    recordLocalLaunchFailure = (message: string, exitReason: LocalLaunchExitReason): void => {
        this.localLaunchFailure = { message, exitReason };
    };

    sendCodexMessage = (message: unknown): void => {
        this.client.sendCodexMessage(message);
    };

    sendUserMessage = (text: string): void => {
        this.client.sendUserMessage(text);
    };

    sendSessionEvent = (event: Parameters<ApiSessionClient['sendSessionEvent']>[0]): void => {
        this.client.sendSessionEvent(event);
    };

    async ensureRemoteBridge(): Promise<VibyMcpBridge> {
        if (!this.remoteBridge) {
            this.remoteBridge = await buildVibyMcpBridge(this.client);
        }
        return this.remoteBridge;
    }

    async ensureRemoteBackend(config: {
        model?: string | null
        hookSettingsPath?: string
        permissionMode?: PermissionMode
    }): Promise<GeminiBackend> {
        const nextBackendKey = JSON.stringify({
            model: config.model ?? null,
            hookSettingsPath: config.hookSettingsPath ?? null,
            permissionMode: config.permissionMode ?? null
        });

        if (this.remoteBackend && this.remoteBackendKey === nextBackendKey) {
            return this.remoteBackend;
        }

        if (this.remoteBackend) {
            await this.remoteBackend.disconnect();
            this.remoteBackend = null;
            this.remoteBackendKey = null;
        }

        this.remoteBackend = createGeminiBackend({
            model: config.model ?? undefined,
            resumeSessionId: this.sessionId,
            hookSettingsPath: config.hookSettingsPath,
            cwd: this.path,
            permissionMode: config.permissionMode
        });
        this.remoteBackendKey = nextBackendKey;
        return this.remoteBackend;
    }

    getRemoteBackend(): GeminiBackend | null {
        return this.remoteBackend
    }

    disposeRemoteRuntime = async (): Promise<void> => {
        if (this.remoteBackend) {
            const backend = this.remoteBackend;
            this.remoteBackend = null;
            this.remoteBackendKey = null;
            await backend.disconnect();
        }

        if (this.remoteBridge) {
            const bridge = this.remoteBridge;
            this.remoteBridge = null;
            bridge.server.stop();
        }
    };
}
