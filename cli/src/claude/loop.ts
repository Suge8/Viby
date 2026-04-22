import type { ClaudePermissionMode } from '@viby/protocol/types'
import { ApiSessionClient } from '@/api/apiSession'
import type { ClaudeSessionModelReasoningEffort, SessionModel } from '@/api/types'
import { ApiClient } from '@/lib'
import { logger } from '@/ui/logger'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { claudeRemoteLauncher } from './claudeRemoteLauncher'
import { Session } from './session'

export type PermissionMode = ClaudePermissionMode

export interface EnhancedMode {
    permissionMode: PermissionMode
    model?: string
    modelReasoningEffort?: ClaudeSessionModelReasoningEffort
    fallbackModel?: string
    customSystemPrompt?: string
    appendSystemPrompt?: string
    allowedTools?: string[]
    disallowedTools?: string[]
}

interface LoopOptions {
    path: string
    model?: SessionModel
    modelReasoningEffort?: ClaudeSessionModelReasoningEffort
    permissionMode?: PermissionMode
    startedBy?: 'runner' | 'terminal'
    mcpServers: Record<string, unknown>
    session: ApiSessionClient
    api: ApiClient
    claudeEnvVars?: Record<string, string>
    claudeArgs?: string[]
    messageQueue: MessageQueue2<EnhancedMode>
    allowedTools?: string[]
    onSessionReady?: (session: Session) => void
    hookSettingsPath: string
}

export async function loop(opts: LoopOptions): Promise<void> {
    const session = new Session({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        sessionId: null,
        claudeEnvVars: opts.claudeEnvVars,
        claudeArgs: opts.claudeArgs,
        mcpServers: opts.mcpServers,
        logPath: logger.logFilePath,
        messageQueue: opts.messageQueue,
        allowedTools: opts.allowedTools,
        startedBy: opts.startedBy ?? 'terminal',
        hookSettingsPath: opts.hookSettingsPath,
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
        modelReasoningEffort: opts.modelReasoningEffort,
    })

    opts.onSessionReady?.(session)
    await claudeRemoteLauncher(session)
}
