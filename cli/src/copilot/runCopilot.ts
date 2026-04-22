import type { SessionHandoffSnapshot } from '@viby/protocol/types'
import { createPendingSessionContinuityHandoffState } from '@/agent/driverSwitchHandoffState'
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
import { copilotLoop } from './loop'
import type { CopilotSession } from './session'
import type { EnhancedMode, PermissionMode } from './types'

function resolveSessionModel(value: unknown): string | null {
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

export async function runCopilot(
    opts: {
        startedBy?: 'runner' | 'terminal'
        vibySessionId?: string
        driverSwitchBootstrap?: boolean
        permissionMode?: PermissionMode
        resumeSessionId?: string
        model?: string
        sessionContinuityHandoff?: SessionHandoffSnapshot
    } = {}
): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'

    logger.debug(`[copilot] Starting with options: startedBy=${startedBy}`)
    if (opts.sessionContinuityHandoff) {
        logger.debug('[copilot] Loaded session continuity handoff for Copilot bootstrap')
    }

    const state: AgentState = { controlledByUser: false }

    const { api, session } = await bootstrapSession({
        driver: 'copilot',
        sessionId: opts.vibySessionId,
        startedBy,
        driverSwitchBootstrap: opts.driverSwitchBootstrap,
        workingDirectory,
        agentState: state,
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
    })

    const durableSessionId = session.sessionId
    setControlledByUser(session, false)
    const canonicalResumeSessionId = opts.resumeSessionId === durableSessionId ? opts.resumeSessionId : undefined

    if (opts.resumeSessionId && !canonicalResumeSessionId) {
        logger.debug(
            `[copilot] Ignoring non-canonical resume handle ${opts.resumeSessionId}; durable owner is ${durableSessionId}`
        )
    }

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) =>
        hashObject({
            permissionMode: mode.permissionMode,
            model: mode.model,
            developerInstructions: mode.developerInstructions,
        })
    )

    const sessionWrapperRef: { current: CopilotSession | null } = { current: null }
    const pendingSessionContinuityHandoff = createPendingSessionContinuityHandoffState(opts.sessionContinuityHandoff)

    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default'
    let currentModel: string | null = opts.model ?? null

    let lifecycle!: ReturnType<typeof createRunnerLifecycle>
    const requestRuntimeStopOrExit = createRuntimeStopRequestHandler({
        getOwner: () => sessionWrapperRef.current,
        cleanupAndExit: () => lifecycle.cleanupAndExit(),
    })
    lifecycle = createRunnerLifecycle({
        session,
        logTag: 'copilot',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive(),
        requestShutdown: requestRuntimeStopOrExit,
        onBeforeClose: async () => {
            // SDK client is cleaned up inside the remote launcher — nothing to do here
        },
    })

    lifecycle.registerProcessHandlers()
    registerKillSessionHandler(session.rpcHandlerManager, requestRuntimeStopOrExit)

    const syncSessionMode = (): void => {
        const instance = sessionWrapperRef.current
        if (!instance) return
        instance.setPermissionMode(currentPermissionMode)
        instance.setModel(currentModel)
        logger.debug(
            `[copilot] Synced session mode: permissionMode=${currentPermissionMode}, model=${currentModel ?? 'auto'}`
        )
    }

    session.onUserMessage((message) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments)
        const continuityInstructions = pendingSessionContinuityHandoff.consumeForUserMessage(formattedText)
        if (continuityInstructions) {
            logger.debug('[copilot] Consuming pending session continuity handoff on first user turn')
        }
        const mode: EnhancedMode = {
            permissionMode: currentPermissionMode,
            model: currentModel ?? undefined,
            developerInstructions: continuityInstructions,
        }
        messageQueue.push(formattedText, mode)
    })

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as {
            permissionMode?: unknown
            model?: unknown
        }

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionModeForDriver(config.permissionMode, 'copilot') as PermissionMode
        }

        if (config.model !== undefined) {
            currentModel = resolveSessionModel(config.model)
        }

        syncSessionMode()
        return {
            applied: {
                permissionMode: currentPermissionMode,
                model: currentModel,
            },
        }
    })

    try {
        await copilotLoop({
            path: workingDirectory,
            durableSessionId,
            startedBy,
            messageQueue,
            session,
            api,
            permissionMode: currentPermissionMode,
            resumeSessionId: canonicalResumeSessionId,
            model: currentModel ?? undefined,
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance
                syncSessionMode()
            },
        })
    } catch (error) {
        lifecycle.markCrash(error)
        logger.debug('[copilot] Loop error:', error)
    } finally {
        await lifecycle.cleanupAndExit()
    }
}
