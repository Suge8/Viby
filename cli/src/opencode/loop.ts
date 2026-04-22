import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { ApiClient, ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { opencodeRemoteLauncher } from './opencodeRemoteLauncher'
import { OpencodeSession } from './session'
import type { OpencodeMode, PermissionMode } from './types'
import type { OpencodeHookServer } from './utils/startOpencodeHookServer'

interface OpencodeLoopOptions {
    path: string
    startedBy?: 'runner' | 'terminal'
    messageQueue: MessageQueue2<OpencodeMode>
    session: ApiSessionClient
    api: ApiClient
    permissionMode?: PermissionMode
    resumeSessionId?: string
    hookServer: OpencodeHookServer
    hookUrl: string
    onSessionReady?: (session: OpencodeSession) => void
}

export async function opencodeLoop(opts: OpencodeLoopOptions): Promise<void> {
    const session = new OpencodeSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        sessionId: opts.resumeSessionId ?? null,
        logPath: logger.getLogPath(),
        messageQueue: opts.messageQueue,
        startedBy: opts.startedBy ?? 'terminal',
        permissionMode: opts.permissionMode ?? 'default',
    })

    if (opts.resumeSessionId) {
        reportDiscoveredSessionId(session.onSessionFound, opts.resumeSessionId)
    }

    opts.onSessionReady?.(session)
    await opencodeRemoteLauncher(session)
}
