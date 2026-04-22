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
import { type EnhancedMode, loop, type PermissionMode } from './loop'
import type { CursorSession } from './session'

export async function runCursor(opts: {
    startedBy?: 'runner' | 'terminal'
    vibySessionId?: string
    driverSwitchBootstrap?: boolean
    cursorArgs?: string[]
    permissionMode?: PermissionMode
    resumeSessionId?: string
    model?: string
    sessionContinuityHandoff?: SessionHandoffSnapshot
}): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'

    logger.debug(`[cursor] Starting with options: startedBy=${startedBy}`)
    if (opts.sessionContinuityHandoff) {
        logger.debug('[cursor] Loaded session continuity handoff for Cursor bootstrap')
    }

    const state: AgentState = {
        controlledByUser: false,
    }
    const { api, session } = await bootstrapSession({
        driver: 'cursor',
        sessionId: opts.vibySessionId,
        startedBy,
        driverSwitchBootstrap: opts.driverSwitchBootstrap,
        workingDirectory,
        agentState: state,
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
    })

    setControlledByUser(session, false)

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) =>
        hashObject({
            permissionMode: mode.permissionMode,
            model: mode.model,
            developerInstructions: mode.developerInstructions,
        })
    )

    const sessionWrapperRef: { current: CursorSession | null } = { current: null }
    const pendingSessionContinuityHandoff = createPendingSessionContinuityHandoffState(opts.sessionContinuityHandoff)

    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default'
    const currentModel = opts.model

    let lifecycle!: ReturnType<typeof createRunnerLifecycle>
    const requestRuntimeStopOrExit = createRuntimeStopRequestHandler({
        getOwner: () => sessionWrapperRef.current,
        cleanupAndExit: () => lifecycle.cleanupAndExit(),
    })
    lifecycle = createRunnerLifecycle({
        session,
        logTag: 'cursor',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive(),
        requestShutdown: requestRuntimeStopOrExit,
        onBeforeClose: async () => {
            await sessionWrapperRef.current?.disposeRemoteRuntime()
        },
    })

    lifecycle.registerProcessHandlers()
    registerKillSessionHandler(session.rpcHandlerManager, requestRuntimeStopOrExit)

    const syncSessionMode = () => {
        const sessionInstance = sessionWrapperRef.current
        if (!sessionInstance) {
            return
        }
        sessionInstance.setPermissionMode(currentPermissionMode)
        logger.debug(`[cursor] Synced session permission mode: ${currentPermissionMode}`)
    }

    session.onUserMessage((message) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments)
        const continuityInstructions = pendingSessionContinuityHandoff.consumeForUserMessage(formattedText)
        if (continuityInstructions) {
            logger.debug('[cursor] Consuming pending session continuity handoff on the first real user turn')
        }
        const enhancedMode: EnhancedMode = {
            permissionMode: currentPermissionMode ?? 'default',
            model: currentModel,
            developerInstructions: continuityInstructions,
        }
        messageQueue.push(formattedText, enhancedMode)
    })

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as { permissionMode?: unknown }

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionModeForDriver(config.permissionMode, 'cursor') as PermissionMode
        }

        syncSessionMode()
        return { applied: { permissionMode: currentPermissionMode } }
    })

    try {
        await loop({
            path: workingDirectory,
            messageQueue,
            api,
            session,
            cursorArgs: opts.cursorArgs,
            startedBy,
            permissionMode: currentPermissionMode,
            resumeSessionId: opts.resumeSessionId,
            model: opts.model,
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance
                syncSessionMode()
            },
        })
    } catch (error) {
        lifecycle.markCrash(error)
        logger.debug('[cursor] Loop error:', error)
    } finally {
        await lifecycle.cleanupAndExit()
    }
}
