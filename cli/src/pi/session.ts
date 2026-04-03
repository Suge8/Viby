import type { PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'
import type { ApiClient, ApiSessionClient } from '@/lib'
import { setSessionDriverRuntimeHandle } from '@viby/protocol'
import { AgentSessionBase } from '@/agent/sessionBase'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { PiMode } from './types'

export class PiSession extends AgentSessionBase<PiMode> {
    readonly startedBy: 'runner' | 'terminal'

    constructor(opts: {
        api: ApiClient
        client: ApiSessionClient
        path: string
        logPath: string
        sessionId: string | null
        messageQueue: MessageQueue2<PiMode>
        startedBy: 'runner' | 'terminal'
    }) {
        super({
            api: opts.api,
            client: opts.client,
            path: opts.path,
            logPath: opts.logPath,
            sessionId: opts.sessionId,
            messageQueue: opts.messageQueue,
            onModeChange: () => {},
            mode: 'remote',
            sessionLabel: 'PiSession',
            sessionIdLabel: 'Pi',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                ...setSessionDriverRuntimeHandle(metadata, 'pi', { sessionId })
            })
        })

        this.startedBy = opts.startedBy
    }

    setPermissionMode(mode: PiPermissionMode): void {
        this.permissionMode = mode
        this.notifyKeepAliveRuntimeChanged()
    }

    setModel(model: SessionModel): void {
        this.model = model
        this.notifyKeepAliveRuntimeChanged()
    }

    setModelReasoningEffort(modelReasoningEffort: SessionModelReasoningEffort): void {
        this.modelReasoningEffort = modelReasoningEffort
        this.notifyKeepAliveRuntimeChanged()
    }

    sendStreamUpdate(update: Parameters<ApiSessionClient['sendStreamUpdate']>[0]): void {
        this.client.sendStreamUpdate(update)
    }

    sendOutputMessage(data: unknown): void {
        this.client.sendOutputMessage(data)
    }

    sendSessionEvent(event: Parameters<ApiSessionClient['sendSessionEvent']>[0]): void {
        this.client.sendSessionEvent(event)
    }
}
