import type { CodexCollaborationMode, CodexPermissionMode, CodexReasoningEffort } from '@viby/protocol/types'
import { ApiClient, ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { codexRemoteLauncher } from './codexRemoteLauncher'
import { CodexSession } from './session'
import type { CodexCliOverrides } from './utils/codexCliOverrides'

export type PermissionMode = CodexPermissionMode

export interface EnhancedMode {
    permissionMode: PermissionMode
    model?: string
    collaborationMode: CodexCollaborationMode
    modelReasoningEffort?: CodexReasoningEffort | null
    developerInstructions?: string
}

interface LoopOptions {
    path: string
    startedBy?: 'runner' | 'terminal'
    messageQueue: MessageQueue2<EnhancedMode>
    session: ApiSessionClient
    api: ApiClient
    codexArgs?: string[]
    codexCliOverrides?: CodexCliOverrides
    permissionMode?: PermissionMode
    model?: string
    modelReasoningEffort?: CodexReasoningEffort | null
    collaborationMode?: CodexCollaborationMode
    resumeSessionId?: string
    onSessionReady?: (session: CodexSession) => void
}

export async function loop(opts: LoopOptions): Promise<void> {
    const session = new CodexSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        sessionId: opts.resumeSessionId ?? null,
        logPath: logger.getLogPath(),
        messageQueue: opts.messageQueue,
        startedBy: opts.startedBy ?? 'terminal',
        codexArgs: opts.codexArgs,
        codexCliOverrides: opts.codexCliOverrides,
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
        modelReasoningEffort: opts.modelReasoningEffort,
        collaborationMode: opts.collaborationMode ?? 'default',
    })

    opts.onSessionReady?.(session)
    await codexRemoteLauncher(session)
}
