import { setSessionDriverRuntimeHandle } from '@viby/protocol'
import { AgentSessionBase } from '@/agent/sessionBase'
import type { CodexSessionModelReasoningEffort, SessionModel } from '@/api/types'
import { ApiClient, ApiSessionClient } from '@/lib'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { CodexAppServerClient } from './codexAppServerClient'
import type { EnhancedMode, PermissionMode } from './loop'
import { buildVibyMcpBridge, type VibyMcpBridge } from './utils/buildVibyMcpBridge'
import type { CodexCliOverrides } from './utils/codexCliOverrides'

export class CodexSession extends AgentSessionBase<EnhancedMode> {
    readonly codexArgs?: string[]
    readonly codexCliOverrides?: CodexCliOverrides
    readonly startedBy: 'runner' | 'terminal'
    private appServerClient: CodexAppServerClient | null = null
    private remoteBridge: VibyMcpBridge | null = null

    constructor(opts: {
        api: ApiClient
        client: ApiSessionClient
        path: string
        logPath: string
        sessionId: string | null
        messageQueue: MessageQueue2<EnhancedMode>
        startedBy: 'runner' | 'terminal'
        codexArgs?: string[]
        codexCliOverrides?: CodexCliOverrides
        permissionMode?: PermissionMode
        model?: SessionModel
        modelReasoningEffort?: CodexSessionModelReasoningEffort
        collaborationMode?: EnhancedMode['collaborationMode']
    }) {
        super({
            api: opts.api,
            client: opts.client,
            path: opts.path,
            logPath: opts.logPath,
            sessionId: opts.sessionId,
            messageQueue: opts.messageQueue,
            sessionLabel: 'CodexSession',
            sessionIdLabel: 'Codex',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                ...setSessionDriverRuntimeHandle(metadata, 'codex', { sessionId }),
            }),
            permissionMode: opts.permissionMode,
            model: opts.model,
            modelReasoningEffort: opts.modelReasoningEffort,
            collaborationMode: opts.collaborationMode,
        })

        this.codexArgs = opts.codexArgs
        this.codexCliOverrides = opts.codexCliOverrides
        this.startedBy = opts.startedBy
        this.permissionMode = opts.permissionMode
        this.model = opts.model
        this.modelReasoningEffort = opts.modelReasoningEffort
        this.collaborationMode = opts.collaborationMode
    }

    setPermissionMode = (mode: PermissionMode): void => {
        this.permissionMode = mode
        this.notifyKeepAliveRuntimeChanged()
    }

    setModel = (model: SessionModel): void => {
        this.model = model
        this.notifyKeepAliveRuntimeChanged()
    }

    setModelReasoningEffort = (modelReasoningEffort: CodexSessionModelReasoningEffort): void => {
        this.modelReasoningEffort = modelReasoningEffort
        this.notifyKeepAliveRuntimeChanged()
    }

    getModelReasoningEffort(): CodexSessionModelReasoningEffort | undefined {
        return this.modelReasoningEffort as CodexSessionModelReasoningEffort | undefined
    }

    setCollaborationMode = (mode: EnhancedMode['collaborationMode']): void => {
        this.collaborationMode = mode
        this.notifyKeepAliveRuntimeChanged()
    }

    sendCodexMessage = (...args: Parameters<ApiSessionClient['sendCodexMessage']>): void => {
        this.client.sendCodexMessage(...args)
    }

    sendUserMessage = (text: string): void => {
        this.client.sendUserMessage(text)
    }

    sendSessionEvent = (event: Parameters<ApiSessionClient['sendSessionEvent']>[0]): void => {
        this.client.sendSessionEvent(event)
    }

    sendStreamUpdate = (update: Parameters<ApiSessionClient['sendStreamUpdate']>[0]): void => {
        this.client.sendStreamUpdate(update)
    }

    getAppServerClient(): CodexAppServerClient {
        if (!this.appServerClient) {
            this.appServerClient = new CodexAppServerClient()
        }
        return this.appServerClient
    }

    async ensureRemoteBridge(): Promise<VibyMcpBridge> {
        if (!this.remoteBridge) {
            this.remoteBridge = await buildVibyMcpBridge(this.client)
        }
        return this.remoteBridge
    }

    disposeAppServerClient = async (): Promise<void> => {
        if (this.appServerClient) {
            const client = this.appServerClient
            this.appServerClient = null
            await client.disconnect()
        }

        if (this.remoteBridge) {
            const bridge = this.remoteBridge
            this.remoteBridge = null
            bridge.server?.stop()
        }
    }
}
