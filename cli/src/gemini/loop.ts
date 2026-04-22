import { ApiClient, ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { geminiRemoteLauncher } from './geminiRemoteLauncher'
import { GeminiSession } from './session'
import type { GeminiMode, PermissionMode } from './types'

interface GeminiLoopOptions {
    path: string
    startedBy?: 'runner' | 'terminal'
    messageQueue: MessageQueue2<GeminiMode>
    session: ApiSessionClient
    api: ApiClient
    permissionMode?: PermissionMode
    resumeSessionId?: string
    model?: string
    hookSettingsPath?: string
    onSessionReady?: (session: GeminiSession) => void
}

export async function geminiLoop(opts: GeminiLoopOptions): Promise<void> {
    const session = new GeminiSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        sessionId: opts.resumeSessionId ?? null,
        logPath: logger.getLogPath(),
        messageQueue: opts.messageQueue,
        startedBy: opts.startedBy ?? 'terminal',
        permissionMode: opts.permissionMode ?? 'default',
    })

    opts.onSessionReady?.(session)
    await geminiRemoteLauncher(session, {
        model: session.getModel() ?? opts.model,
        hookSettingsPath: opts.hookSettingsPath,
    })
}
