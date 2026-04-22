import { setSessionDriverRuntimeHandle } from '@viby/protocol'
import { AgentSessionBase } from '@/agent/sessionBase'
import type { ApiSessionClient } from '@/api/apiSession'
import { ApiClient } from '@/lib'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { EnhancedMode, PermissionMode } from './types'

export class CopilotSession extends AgentSessionBase<EnhancedMode> {
    readonly startedBy: 'runner' | 'terminal'
    readonly durableSessionId: string

    constructor(opts: {
        api: ApiClient
        client: ApiSessionClient
        path: string
        logPath: string
        durableSessionId: string
        sessionId: string | null
        messageQueue: MessageQueue2<EnhancedMode>
        startedBy: 'runner' | 'terminal'
        permissionMode?: PermissionMode
        model?: string
    }) {
        super({
            api: opts.api,
            client: opts.client,
            path: opts.path,
            logPath: opts.logPath,
            sessionId: opts.sessionId,
            messageQueue: opts.messageQueue,
            sessionLabel: 'CopilotSession',
            sessionIdLabel: 'Copilot',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                ...setSessionDriverRuntimeHandle(metadata, 'copilot', { sessionId }),
            }),
            permissionMode: opts.permissionMode,
            model: opts.model,
        })
        this.startedBy = opts.startedBy
        this.durableSessionId = opts.durableSessionId
    }

    get currentPermissionMode(): PermissionMode {
        return (this.permissionMode as PermissionMode | undefined) ?? 'default'
    }

    get currentModel(): string | undefined {
        return typeof this.model === 'string' ? this.model : undefined
    }

    setPermissionMode = (mode: PermissionMode): void => {
        this.permissionMode = mode
        this.notifyKeepAliveRuntimeChanged()
    }

    setModel = (model: string | null): void => {
        this.model = model
        this.notifyKeepAliveRuntimeChanged()
    }

    sendCodexMessage = (message: unknown): void => {
        this.client.sendCodexMessage(message)
    }

    sendSessionEvent = (event: Parameters<ApiSessionClient['sendSessionEvent']>[0]): void => {
        this.client.sendSessionEvent(event)
    }
}
