import { ApiClient, ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { copilotRemoteLauncher } from './copilotRemoteLauncher'
import { CopilotSession } from './session'
import type { EnhancedMode, PermissionMode } from './types'

interface CopilotLoopOptions {
    path: string
    durableSessionId: string
    startedBy?: 'runner' | 'terminal'
    messageQueue: MessageQueue2<EnhancedMode>
    session: ApiSessionClient
    api: ApiClient
    permissionMode?: PermissionMode
    resumeSessionId?: string
    model?: string
    onSessionReady?: (session: CopilotSession) => void
}

export async function copilotLoop(opts: CopilotLoopOptions): Promise<void> {
    const session = new CopilotSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        logPath: logger.getLogPath(),
        durableSessionId: opts.durableSessionId,
        sessionId: opts.resumeSessionId ?? null,
        messageQueue: opts.messageQueue,
        startedBy: opts.startedBy ?? 'terminal',
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
    })

    opts.onSessionReady?.(session)
    await copilotRemoteLauncher(session)
}
