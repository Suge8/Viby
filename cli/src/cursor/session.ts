import { setSessionDriverRuntimeHandle } from '@viby/protocol'
import { AgentSessionBase } from '@/agent/sessionBase'
import { buildVibyMcpBridge, type VibyMcpBridge } from '@/codex/utils/buildVibyMcpBridge'
import { ApiClient, ApiSessionClient } from '@/lib'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { EnhancedMode, PermissionMode } from './loop'

export class CursorSession extends AgentSessionBase<EnhancedMode> {
    readonly cursorArgs?: string[]
    readonly model?: string
    readonly startedBy: 'runner' | 'terminal'
    private remoteBridge: VibyMcpBridge | null = null

    constructor(opts: {
        api: ApiClient
        client: ApiSessionClient
        path: string
        logPath: string
        sessionId: string | null
        messageQueue: MessageQueue2<EnhancedMode>
        startedBy: 'runner' | 'terminal'
        cursorArgs?: string[]
        model?: string
        permissionMode?: PermissionMode
    }) {
        super({
            api: opts.api,
            client: opts.client,
            path: opts.path,
            logPath: opts.logPath,
            sessionId: opts.sessionId,
            messageQueue: opts.messageQueue,
            sessionLabel: 'CursorSession',
            sessionIdLabel: 'Cursor',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                ...setSessionDriverRuntimeHandle(metadata, 'cursor', { sessionId }),
            }),
            permissionMode: opts.permissionMode,
        })

        this.cursorArgs = opts.cursorArgs
        this.model = opts.model
        this.startedBy = opts.startedBy
        this.permissionMode = opts.permissionMode
    }

    setPermissionMode = (mode: PermissionMode): void => {
        this.permissionMode = mode
        this.notifyKeepAliveRuntimeChanged()
    }

    sendCodexMessage = (message: unknown): void => {
        this.client.sendCodexMessage(message)
    }

    sendUserMessage = (text: string): void => {
        this.client.sendUserMessage(text)
    }

    sendSessionEvent = (event: Parameters<ApiSessionClient['sendSessionEvent']>[0]): void => {
        this.client.sendSessionEvent(event)
    }

    async ensureRemoteBridge(): Promise<VibyMcpBridge> {
        if (!this.remoteBridge) {
            this.remoteBridge = await buildVibyMcpBridge(this.client)
        }
        return this.remoteBridge
    }

    disposeRemoteRuntime = async (): Promise<void> => {
        if (!this.remoteBridge) {
            return
        }

        const bridge = this.remoteBridge
        this.remoteBridge = null
        bridge.server?.stop()
    }
}
