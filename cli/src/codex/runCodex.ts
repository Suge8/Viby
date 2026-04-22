import type { SessionHandoffSnapshot } from '@viby/protocol'
import { CodexCollaborationModeSchema, CodexReasoningEffortSchema } from '@viby/protocol/schemas'
import type { CodexReasoningEffort } from '@viby/protocol/types'
import { createPendingSessionContinuityHandoffState } from '@/agent/driverSwitchHandoffState'
import { mergePromptSegments } from '@/agent/promptInstructions'
import { assertSessionConfigPayload, resolvePermissionModeForDriver } from '@/agent/providerConfig'
import { createRunnerLifecycle, createRuntimeStopRequestHandler, setControlledByUser } from '@/agent/runnerLifecycle'
import { bootstrapSession } from '@/agent/sessionFactory'
import type { AgentState } from '@/api/types'
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler'
import { logger } from '@/ui/logger'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'
import { hashObject } from '@/utils/deterministicJson'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { type EnhancedMode, loop, type PermissionMode } from './loop'
import {
    applyRuntimeConfigToSession,
    createCodexRuntimeConfig,
    createQueuedCodexMode,
    syncRuntimeConfigFromSession,
} from './runCodexRuntimeConfig'
import type { CodexSession } from './session'
import { parseCodexCliOverrides } from './utils/codexCliOverrides'

export { emitReadyIfIdle } from '@/agent/emitReadyIfIdle'

export async function runCodex(opts: {
    startedBy?: 'runner' | 'terminal'
    vibySessionId?: string
    driverSwitchBootstrap?: boolean
    codexArgs?: string[]
    permissionMode?: PermissionMode
    resumeSessionId?: string
    model?: string
    modelReasoningEffort?: CodexReasoningEffort | null
    collaborationMode?: EnhancedMode['collaborationMode']
    sessionContinuityHandoff?: SessionHandoffSnapshot
}): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'

    logger.debug(`[codex] Starting with options: startedBy=${startedBy}`)
    if (opts.sessionContinuityHandoff) {
        logger.debug('[codex] Loaded session continuity handoff for Codex bootstrap')
    }

    const state: AgentState = {
        controlledByUser: false,
    }
    const { api, session } = await bootstrapSession({
        driver: 'codex',
        sessionId: opts.vibySessionId,
        startedBy,
        driverSwitchBootstrap: opts.driverSwitchBootstrap,
        workingDirectory,
        agentState: state,
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
        modelReasoningEffort: opts.modelReasoningEffort,
        collaborationMode: opts.collaborationMode ?? 'default',
    })
    setControlledByUser(session, false)

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) =>
        hashObject({
            permissionMode: mode.permissionMode,
            model: mode.model,
            modelReasoningEffort: mode.modelReasoningEffort,
            collaborationMode: mode.collaborationMode,
            developerInstructions: mode.developerInstructions,
        })
    )
    const pendingSessionContinuityHandoff = createPendingSessionContinuityHandoffState(opts.sessionContinuityHandoff)

    const codexCliOverrides = parseCodexCliOverrides(opts.codexArgs)
    const sessionWrapperRef: { current: CodexSession | null } = { current: null }

    let runtimeConfig = createCodexRuntimeConfig({
        permissionMode: opts.permissionMode,
        model: opts.model,
        modelReasoningEffort: opts.modelReasoningEffort,
        collaborationMode: opts.collaborationMode,
    })

    let lifecycle!: ReturnType<typeof createRunnerLifecycle>
    const requestRuntimeStopOrExit = createRuntimeStopRequestHandler({
        getOwner: () => sessionWrapperRef.current,
        cleanupAndExit: () => lifecycle.cleanupAndExit(),
    })
    lifecycle = createRunnerLifecycle({
        session,
        logTag: 'codex',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive(),
        requestShutdown: requestRuntimeStopOrExit,
        onBeforeClose: async () => {
            await sessionWrapperRef.current?.disposeAppServerClient()
        },
    })

    lifecycle.registerProcessHandlers()
    registerKillSessionHandler(session.rpcHandlerManager, requestRuntimeStopOrExit)

    function syncSessionMode(): void {
        const sessionInstance = sessionWrapperRef.current
        if (!sessionInstance) {
            return
        }
        runtimeConfig = applyRuntimeConfigToSession(runtimeConfig, sessionInstance)
    }

    session.onUserMessage((message) => {
        runtimeConfig = syncRuntimeConfigFromSession(runtimeConfig, sessionWrapperRef.current)

        logger.debug(
            `[Codex] User message received with permission mode: ${runtimeConfig.permissionMode}, ` +
                `model: ${runtimeConfig.model ?? 'auto'}, reasoningEffort: ${runtimeConfig.modelReasoningEffort ?? 'auto'}, ` +
                `collaborationMode: ${runtimeConfig.collaborationMode}`
        )

        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments)
        const continuityInstructions = pendingSessionContinuityHandoff.consumeForUserMessage(formattedText)
        if (continuityInstructions) {
            logger.debug('[Codex] Consuming pending session continuity handoff on the first real user turn')
        }
        const enhancedMode = createQueuedCodexMode(runtimeConfig, mergePromptSegments(continuityInstructions))
        messageQueue.push(formattedText, enhancedMode)
    })

    const resolveCollaborationMode = (value: unknown): EnhancedMode['collaborationMode'] => {
        if (value === null) {
            return 'default'
        }
        const parsed = CodexCollaborationModeSchema.safeParse(value)
        if (!parsed.success) {
            throw new Error('Invalid collaboration mode')
        }
        return parsed.data
    }

    const resolveModel = (value: unknown): string | null => {
        if (value === null) {
            return null
        }
        if (typeof value !== 'string') {
            throw new Error('Invalid model')
        }
        const trimmed = value.trim()
        if (!trimmed) {
            throw new Error('Invalid model')
        }
        return trimmed
    }

    const resolveModelReasoningEffort = (value: unknown): CodexReasoningEffort | null => {
        if (value === null) {
            return null
        }
        const parsed = CodexReasoningEffortSchema.safeParse(value)
        if (!parsed.success) {
            throw new Error('Invalid model reasoning effort')
        }
        return parsed.data
    }

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as {
            permissionMode?: unknown
            model?: unknown
            modelReasoningEffort?: unknown
            collaborationMode?: unknown
        }

        if (config.permissionMode !== undefined) {
            runtimeConfig = {
                ...runtimeConfig,
                permissionMode: resolvePermissionModeForDriver(config.permissionMode, 'codex') as PermissionMode,
            }
        }

        if (config.model !== undefined) {
            runtimeConfig = {
                ...runtimeConfig,
                model: resolveModel(config.model) ?? undefined,
            }
        }

        if (config.modelReasoningEffort !== undefined) {
            runtimeConfig = {
                ...runtimeConfig,
                modelReasoningEffort: resolveModelReasoningEffort(config.modelReasoningEffort),
            }
        }

        if (config.collaborationMode !== undefined) {
            runtimeConfig = {
                ...runtimeConfig,
                collaborationMode: resolveCollaborationMode(config.collaborationMode),
            }
        }

        syncSessionMode()
        return {
            applied: {
                permissionMode: runtimeConfig.permissionMode,
                model: runtimeConfig.model ?? null,
                modelReasoningEffort: runtimeConfig.modelReasoningEffort,
                collaborationMode: runtimeConfig.collaborationMode,
            },
        }
    })

    let loopError: unknown = null
    try {
        await loop({
            path: workingDirectory,
            messageQueue,
            api,
            session,
            codexArgs: opts.codexArgs,
            codexCliOverrides,
            startedBy,
            permissionMode: runtimeConfig.permissionMode,
            model: runtimeConfig.model,
            modelReasoningEffort: runtimeConfig.modelReasoningEffort,
            collaborationMode: runtimeConfig.collaborationMode,
            resumeSessionId: opts.resumeSessionId,
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance
                syncSessionMode()
            },
        })
    } catch (error) {
        loopError = error
        lifecycle.markCrash(error)
        logger.debug('[codex] Loop error:', error)
    }

    if (loopError) {
        await lifecycle.cleanup()
        throw loopError
    }

    await lifecycle.cleanupAndExit()
}
