import { isPermissionModeAllowedForDriver, type SessionHandoffSnapshot } from '@viby/protocol'
import { createPendingSessionContinuityHandoffState } from '@/agent/driverSwitchHandoffState'
import { createRunnerLifecycle, createRuntimeStopRequestHandler, setControlledByUser } from '@/agent/runnerLifecycle'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { bootstrapSession } from '@/agent/sessionFactory'
import { AgentState, ClaudeSessionModelReasoningEffort, SessionModel } from '@/api/types'
import { loop } from '@/claude/loop'
import { extractSDKMetadataAsync } from '@/claude/sdk/metadataExtractor'
import { startHookServer } from '@/claude/utils/startHookServer'
import { startVibyServer } from '@/claude/utils/startVibyServer'
import { cleanupHookSettingsFile, generateHookSettingsFile } from '@/modules/common/hooks/generateHookSettings'
import { parseSpecialCommand } from '@/parsers/specialCommands'
import { getEnvironmentInfo } from '@/ui/doctor'
import { logger } from '@/ui/logger'
import { hashObject } from '@/utils/deterministicJson'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { EnhancedMode, PermissionMode } from './loop'
import { normalizeClaudeSessionModel } from './model'
import { registerKillSessionHandler } from './registerKillSessionHandler'
import {
    type ClaudeRuntimeSelections,
    registerClaudeSessionConfigHandler,
    registerClaudeUserMessageHandler,
    syncClaudeSessionModes,
} from './runClaudeSupport'
import type { Session } from './session'

export interface StartOptions {
    vibySessionId?: string
    driverSwitchBootstrap?: boolean
    model?: string
    modelReasoningEffort?: ClaudeSessionModelReasoningEffort
    permissionMode?: PermissionMode
    shouldStartRunner?: boolean
    claudeEnvVars?: Record<string, string>
    claudeArgs?: string[]
    startedBy?: 'runner' | 'terminal'
    sessionContinuityHandoff?: SessionHandoffSnapshot
}

export async function runClaude(options: StartOptions = {}): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = options.startedBy ?? 'terminal'

    // Log environment info at startup
    logger.debugLargeJson('[START] VIBY process started', getEnvironmentInfo())
    logger.debug(`[START] Options: startedBy=${startedBy}`)
    if (options.sessionContinuityHandoff) {
        logger.debug('[START] Loaded session continuity handoff for Claude bootstrap')
    }

    const initialState: AgentState = {}
    const initialModel = normalizeClaudeSessionModel(options.model)
    const { api, session, sessionInfo } = await bootstrapSession({
        driver: 'claude',
        sessionId: options.vibySessionId,
        startedBy,
        driverSwitchBootstrap: options.driverSwitchBootstrap,
        workingDirectory,
        agentState: initialState,
        permissionMode: options.permissionMode ?? 'default',
        model: initialModel ?? undefined,
        modelReasoningEffort: options.modelReasoningEffort,
    })
    logger.debug(`Session created: ${sessionInfo.id}`)
    // Extract SDK metadata in background and update session when ready
    extractSDKMetadataAsync(async (sdkMetadata) => {
        logger.debug('[start] SDK metadata extracted, updating session:', sdkMetadata)
        try {
            // Update session metadata with tools and slash commands
            session.updateMetadata(
                (currentMetadata) => ({
                    ...currentMetadata,
                    tools: sdkMetadata.tools,
                    slashCommands: sdkMetadata.slashCommands,
                }),
                {
                    touchUpdatedAt: false,
                }
            )
            logger.debug('[start] Session metadata updated with SDK capabilities')
        } catch (error) {
            logger.debug('[start] Failed to update session metadata:', error)
        }
    })

    // Start VIBY MCP server
    const vibyServer = await startVibyServer(session)
    if (vibyServer) {
        logger.debug(`[START] VIBY MCP server started at ${vibyServer.url}`)
    } else {
        logger.debug('[START] No session-scoped VIBY MCP tools enabled; skipping MCP server bootstrap')
    }

    // Variable to track current session instance (updated via onSessionReady callback)
    const currentSessionRef: { current: Session | null } = { current: null }

    // Start Hook server for receiving Claude session notifications
    const hookServer = await startHookServer({
        onSessionHook: (sessionId, data) => {
            logger.debug(`[START] Session hook received: ${sessionId}`, data)

            const currentSession = currentSessionRef.current
            if (currentSession) {
                const previousSessionId = currentSession.sessionId
                if (previousSessionId !== sessionId) {
                    logger.debug(`[START] Claude session ID changed: ${previousSessionId} -> ${sessionId}`)
                    reportDiscoveredSessionId(currentSession.onSessionFound, sessionId)
                }
            }
        },
    })
    logger.debug(`[START] Hook server started on port ${hookServer.port}`)

    const hookSettingsPath = generateHookSettingsFile(hookServer.port, hookServer.token, {
        filenamePrefix: 'session-hook',
        logLabel: 'generateHookSettings',
    })
    logger.debug(`[START] Generated hook settings file: ${hookSettingsPath}`)

    // Print log file path
    const logPath = logger.logFilePath
    logger.infoDeveloper(`Session: ${sessionInfo.id}`)
    logger.infoDeveloper(`Logs: ${logPath}`)

    let lifecycle!: ReturnType<typeof createRunnerLifecycle>
    const requestRuntimeStopOrExit = createRuntimeStopRequestHandler({
        getOwner: () => currentSessionRef.current,
        cleanupAndExit: () => lifecycle.cleanupAndExit(),
    })
    lifecycle = createRunnerLifecycle({
        session,
        logTag: 'claude',
        stopKeepAlive: () => currentSessionRef.current?.stopKeepAlive(),
        requestShutdown: requestRuntimeStopOrExit,
        onAfterClose: () => {
            vibyServer?.stop()
            hookServer.stop()
            cleanupHookSettingsFile(hookSettingsPath, 'generateHookSettings')
        },
    })

    lifecycle.registerProcessHandlers()
    registerKillSessionHandler(session.rpcHandlerManager, requestRuntimeStopOrExit)

    // Set initial agent state
    setControlledByUser(session, false)

    // Import MessageQueue2 and create message queue
    const messageQueue = new MessageQueue2<EnhancedMode>((mode) =>
        hashObject({
            isPlan: mode.permissionMode === 'plan',
            model: mode.model,
            modelReasoningEffort: mode.modelReasoningEffort,
            fallbackModel: mode.fallbackModel,
            customSystemPrompt: mode.customSystemPrompt,
            appendSystemPrompt: mode.appendSystemPrompt,
            allowedTools: mode.allowedTools,
            disallowedTools: mode.disallowedTools,
        })
    )
    const pendingSessionContinuityHandoff = createPendingSessionContinuityHandoffState(options.sessionContinuityHandoff)

    // Forward messages to the queue
    const selections: ClaudeRuntimeSelections = {
        permissionMode: options.permissionMode ?? 'default',
        model: initialModel,
        modelReasoningEffort: options.modelReasoningEffort ?? null,
    }

    const syncSessionModes = () => {
        syncClaudeSessionModes(currentSessionRef.current, selections)
    }
    registerClaudeUserMessageHandler({
        session,
        getCurrentSession: () => currentSessionRef.current,
        queue: messageQueue,
        selections,
        pendingSessionContinuityHandoff,
    })
    registerClaudeSessionConfigHandler({
        session,
        selections,
        syncSessionModes,
    })

    let loopError: unknown = null
    let loopFailed = false
    try {
        await loop({
            path: workingDirectory,
            model: selections.model,
            modelReasoningEffort: selections.modelReasoningEffort,
            permissionMode: options.permissionMode,
            messageQueue,
            api,
            allowedTools: vibyServer ? vibyServer.toolNames.map((toolName) => `mcp__viby__${toolName}`) : [],
            onSessionReady: (sessionInstance) => {
                currentSessionRef.current = sessionInstance
                syncSessionModes()
            },
            mcpServers: vibyServer
                ? {
                      viby: {
                          type: 'http' as const,
                          url: vibyServer.url,
                      },
                  }
                : {},
            session,
            claudeEnvVars: options.claudeEnvVars,
            claudeArgs: options.claudeArgs,
            startedBy,
            hookSettingsPath,
        })
    } catch (error) {
        loopError = error
        loopFailed = true
        lifecycle.markCrash(error)
    }

    if (loopFailed) {
        await lifecycle.cleanup()
        throw loopError
    }

    await lifecycle.cleanupAndExit()
}
