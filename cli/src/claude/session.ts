import { setSessionDriverRuntimeHandle } from '@viby/protocol'
import { AgentSessionBase } from '@/agent/sessionBase'
import type { ClaudeSessionModelReasoningEffort, SessionModel } from '@/api/types'
import { ApiClient, ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { EnhancedMode, PermissionMode } from './loop'

export class Session extends AgentSessionBase<EnhancedMode> {
    readonly claudeEnvVars?: Record<string, string>
    claudeArgs?: string[]
    readonly mcpServers: Record<string, unknown>
    readonly allowedTools?: string[]
    readonly hookSettingsPath: string
    readonly startedBy: 'runner' | 'terminal'

    constructor(opts: {
        api: ApiClient
        client: ApiSessionClient
        path: string
        logPath: string
        sessionId: string | null
        claudeEnvVars?: Record<string, string>
        claudeArgs?: string[]
        mcpServers: Record<string, unknown>
        messageQueue: MessageQueue2<EnhancedMode>
        allowedTools?: string[]
        startedBy: 'runner' | 'terminal'
        hookSettingsPath: string
        permissionMode?: PermissionMode
        model?: SessionModel
        modelReasoningEffort?: ClaudeSessionModelReasoningEffort
    }) {
        super({
            api: opts.api,
            client: opts.client,
            path: opts.path,
            logPath: opts.logPath,
            sessionId: opts.sessionId,
            messageQueue: opts.messageQueue,
            sessionLabel: 'Session',
            sessionIdLabel: 'Claude Code',
            applySessionIdToMetadata: (metadata, sessionId) => ({
                ...metadata,
                ...setSessionDriverRuntimeHandle(metadata, 'claude', { sessionId }),
            }),
            permissionMode: opts.permissionMode,
            model: opts.model,
            modelReasoningEffort: opts.modelReasoningEffort,
        })

        this.claudeEnvVars = opts.claudeEnvVars
        this.claudeArgs = opts.claudeArgs
        this.mcpServers = opts.mcpServers
        this.allowedTools = opts.allowedTools
        this.hookSettingsPath = opts.hookSettingsPath
        this.startedBy = opts.startedBy
        this.permissionMode = opts.permissionMode
        this.model = opts.model
        this.modelReasoningEffort = opts.modelReasoningEffort
    }

    setPermissionMode = (mode: PermissionMode): void => {
        this.permissionMode = mode
        this.notifyKeepAliveRuntimeChanged()
    }

    setModel = (model: SessionModel): void => {
        this.model = model
        this.notifyKeepAliveRuntimeChanged()
    }

    setModelReasoningEffort = (modelReasoningEffort: ClaudeSessionModelReasoningEffort): void => {
        this.modelReasoningEffort = modelReasoningEffort
        this.notifyKeepAliveRuntimeChanged()
    }

    getModelReasoningEffort(): ClaudeSessionModelReasoningEffort | undefined {
        return this.modelReasoningEffort as ClaudeSessionModelReasoningEffort | undefined
    }

    /**
     * Clear the current session ID (used by /clear command)
     */
    clearSessionId = (): void => {
        this.sessionId = null
        logger.debug('[Session] Session ID cleared')
    }

    /**
     * Consume one-time Claude flags from claudeArgs after Claude spawn
     * Currently handles: --resume (with or without session ID)
     */
    consumeOneTimeFlags = (): void => {
        if (!this.claudeArgs) return

        const filteredArgs: string[] = []
        for (let i = 0; i < this.claudeArgs.length; i++) {
            if (this.claudeArgs[i] === '--resume') {
                // Check if next arg looks like a UUID (contains dashes and alphanumeric)
                if (i + 1 < this.claudeArgs.length) {
                    const nextArg = this.claudeArgs[i + 1]
                    // Simple UUID pattern check - contains dashes and is not another flag
                    if (!nextArg.startsWith('-') && nextArg.includes('-')) {
                        // Skip both --resume and the UUID
                        i++ // Skip the UUID
                        logger.debug(`[Session] Consumed --resume flag with session ID: ${nextArg}`)
                    } else {
                        // Just --resume without UUID
                        logger.debug('[Session] Consumed --resume flag (no session ID)')
                    }
                } else {
                    // --resume at the end of args
                    logger.debug('[Session] Consumed --resume flag (no session ID)')
                }
            } else {
                filteredArgs.push(this.claudeArgs[i])
            }
        }

        this.claudeArgs = filteredArgs.length > 0 ? filteredArgs : undefined
        logger.debug(`[Session] Consumed one-time flags, remaining args:`, this.claudeArgs)
    }
}
