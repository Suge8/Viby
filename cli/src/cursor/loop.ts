import type { CursorPermissionMode } from '@viby/protocol/types'
import { ApiClient, ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { cursorRemoteLauncher } from './cursorRemoteLauncher'
import { CursorSession } from './session'

export type PermissionMode = CursorPermissionMode

export interface EnhancedMode {
    permissionMode: PermissionMode
    model?: string
    developerInstructions?: string
}

interface LoopOptions {
    path: string
    startedBy?: 'runner' | 'terminal'
    messageQueue: MessageQueue2<EnhancedMode>
    session: ApiSessionClient
    api: ApiClient
    cursorArgs?: string[]
    permissionMode?: PermissionMode
    resumeSessionId?: string
    model?: string
    onSessionReady?: (session: CursorSession) => void
}

export async function loop(opts: LoopOptions): Promise<void> {
    const session = new CursorSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        sessionId: opts.resumeSessionId ?? null,
        logPath: logger.getLogPath(),
        messageQueue: opts.messageQueue,
        startedBy: opts.startedBy ?? 'terminal',
        cursorArgs: opts.cursorArgs,
        model: opts.model,
        permissionMode: opts.permissionMode ?? 'default',
    })

    opts.onSessionReady?.(session)
    await cursorRemoteLauncher(session)
}
