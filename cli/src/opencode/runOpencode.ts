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
import { opencodeLoop } from './loop'
import type { OpencodeSession } from './session'
import type { OpencodeMode, PermissionMode } from './types'
import { startOpencodeHookServer } from './utils/startOpencodeHookServer'

export async function runOpencode(
    opts: {
        startedBy?: 'runner' | 'terminal'
        vibySessionId?: string
        driverSwitchBootstrap?: boolean
        permissionMode?: PermissionMode
        resumeSessionId?: string
        sessionContinuityHandoff?: SessionHandoffSnapshot
    } = {}
): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'

    logger.debug(`[opencode] Starting with options: startedBy=${startedBy}`)
    if (opts.sessionContinuityHandoff) {
        logger.debug('[opencode] Loaded session continuity handoff for OpenCode bootstrap')
    }

    const initialState: AgentState = {
        controlledByUser: false,
    }

    const { api, session } = await bootstrapSession({
        driver: 'opencode',
        sessionId: opts.vibySessionId,
        startedBy,
        driverSwitchBootstrap: opts.driverSwitchBootstrap,
        workingDirectory,
        agentState: initialState,
        permissionMode: opts.permissionMode ?? 'default',
    })

    setControlledByUser(session, false)

    const messageQueue = new MessageQueue2<OpencodeMode>((mode) =>
        hashObject({
            permissionMode: mode.permissionMode,
            developerInstructions: mode.developerInstructions,
        })
    )

    const sessionWrapperRef: { current: OpencodeSession | null } = { current: null }
    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default'
    const pendingSessionContinuityHandoff = createPendingSessionContinuityHandoffState(opts.sessionContinuityHandoff)
    const hookServer = await startOpencodeHookServer({
        onEvent: (event) => {
            const currentSession = sessionWrapperRef.current
            if (!currentSession) {
                return
            }
            currentSession.emitHookEvent(event)
        },
    })
    const hookUrl = `http://127.0.0.1:${hookServer.port}/hook/opencode`

    let lifecycle!: ReturnType<typeof createRunnerLifecycle>
    const requestRuntimeStopOrExit = createRuntimeStopRequestHandler({
        getOwner: () => sessionWrapperRef.current,
        cleanupAndExit: () => lifecycle.cleanupAndExit(),
    })
    lifecycle = createRunnerLifecycle({
        session,
        logTag: 'opencode',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive(),
        requestShutdown: requestRuntimeStopOrExit,
        onBeforeClose: async () => {
            await sessionWrapperRef.current?.disposeRemoteRuntime()
        },
        onAfterClose: () => {
            hookServer.stop()
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
        logger.debug(`[opencode] Synced session permission mode for keepalive: ${currentPermissionMode}`)
    }

    session.onUserMessage((message) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments)
        const continuityInstructions = pendingSessionContinuityHandoff.consumeForUserMessage(formattedText)
        if (continuityInstructions) {
            logger.debug('[opencode] Consuming pending session continuity handoff on the first real user turn')
        }
        const mode: OpencodeMode = {
            permissionMode: currentPermissionMode,
            developerInstructions: continuityInstructions,
        }
        messageQueue.push(formattedText, mode)
    })

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as { permissionMode?: unknown }

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionModeForDriver(config.permissionMode, 'opencode') as PermissionMode
        }

        syncSessionMode()
        return { applied: { permissionMode: currentPermissionMode } }
    })

    try {
        await opencodeLoop({
            path: workingDirectory,
            startedBy,
            messageQueue,
            session,
            api,
            permissionMode: currentPermissionMode,
            resumeSessionId: opts.resumeSessionId,
            hookServer,
            hookUrl,
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance
                syncSessionMode()
            },
        })
    } catch (error) {
        lifecycle.markCrash(error)
        logger.debug('[opencode] Loop error:', error)
    } finally {
        await lifecycle.cleanupAndExit()
    }
}
