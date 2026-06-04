import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import { RemoteLauncherBase, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase'
import { logger } from '@/ui/logger'
import { formatClaudeMessageForInk } from '@/ui/messageFormatterInk'
import { Future } from '@/utils/future'
import { claudeRemote } from './claudeRemote'
import { ClaudeRemoteMessageFlow } from './claudeRemoteMessageFlow'
import { extractClaudeAssistantTurnIdFromLogMessage } from './claudeStreamSupport'
import { EnhancedMode } from './loop'
import { Session } from './session'
import { OutgoingMessageQueue } from './utils/OutgoingMessageQueue'
import { PermissionHandler } from './utils/permissionHandler'
import { SDKToLogConverter } from './utils/sdkToLogConverter'

export async function flushClaudeRemotePendingOutput(
    messageQueue: Pick<OutgoingMessageQueue, 'flush' | 'destroy'>,
    messageFlow: Pick<ClaudeRemoteMessageFlow, 'flushDanglingAssistantStream'>
): Promise<void> {
    await messageQueue.flush()
    messageFlow.flushDanglingAssistantStream()
    messageQueue.destroy()
}

export class ClaudeRemoteLauncher extends RemoteLauncherBase {
    private readonly session: Session
    private abortController: AbortController | null = null
    private abortFuture: Future<void> | null = null
    private permissionHandler: PermissionHandler | null = null
    private handleSessionFound: ((sessionId: string) => void) | null = null

    constructor(session: Session) {
        super(process.env.DEBUG ? session.logPath : undefined)
        this.session = session
        this.session.setRuntimeStopHandler(() => this.requestStop())
    }

    private async abort(): Promise<void> {
        if (this.abortController && !this.abortController.signal.aborted) {
            this.abortController.abort()
        }
        this.session.queue.reset()
        this.session.onThinkingChange(false)
        await this.abortFuture?.promise
    }

    private async handleAbortRequest(): Promise<void> {
        logger.debug('[remote]: doAbort')
        await this.abort()
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        return this.start()
    }

    protected async abortForStop(): Promise<void> {
        await this.abort()
    }

    protected async runMainLoop(): Promise<void> {
        logger.debug('[claudeRemoteLauncher] Starting remote launcher')

        const session = this.session
        const messageBuffer = this.messageBuffer

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbortRequest(),
        })

        const permissionHandler = new PermissionHandler(session)
        this.permissionHandler = permissionHandler

        const messageQueue = new OutgoingMessageQueue((logMessage) =>
            session.client.sendClaudeSessionMessage(logMessage, {
                assistantTurnId: extractClaudeAssistantTurnIdFromLogMessage(logMessage) ?? undefined,
            })
        )

        permissionHandler.setOnPermissionRequest((toolCallId: string) => {
            messageQueue.releaseToolCall(toolCallId)
        })

        const sdkToLogConverter = new SDKToLogConverter(
            {
                sessionId: session.sessionId || 'unknown',
                cwd: session.path,
                version: process.env.npm_package_version,
            },
            permissionHandler.getResponses()
        )

        const handleSessionFound = (sessionId: string) => {
            sdkToLogConverter.updateSessionId(sessionId)
        }
        this.handleSessionFound = handleSessionFound
        session.addSessionFoundCallback(handleSessionFound)

        const messageFlow = new ClaudeRemoteMessageFlow(
            permissionHandler,
            messageQueue,
            sdkToLogConverter,
            (logMessage) => {
                session.client.sendClaudeSessionMessage(logMessage, {
                    assistantTurnId: extractClaudeAssistantTurnIdFromLogMessage(logMessage) ?? undefined,
                })
            },
            (assistantTurnId, delta) => {
                session.client.sendStreamUpdate({ kind: 'append', assistantTurnId, delta })
            },
            (assistantTurnId) => {
                session.client.sendStreamUpdate(
                    assistantTurnId ? { kind: 'clear', assistantTurnId } : { kind: 'clear' }
                )
            }
        )

        function onMessage(message: import('./sdk').SDKMessage) {
            formatClaudeMessageForInk(message, messageBuffer)
            messageFlow.handle(message)
        }

        try {
            let pending: {
                message: string
                mode: EnhancedMode
            } | null = null

            let previousSessionId: string | null = null
            while (!this.exitReason) {
                logger.debug('[remote]: launch')
                messageBuffer.addMessage('═'.repeat(40), 'status')

                const isNewSession = session.sessionId !== previousSessionId
                if (isNewSession) {
                    messageBuffer.addMessage('Starting new Claude session...', 'status')
                    permissionHandler.reset()
                    sdkToLogConverter.resetParentChain()
                    logger.debug(
                        `[remote]: New session detected (previous: ${previousSessionId}, current: ${session.sessionId})`
                    )
                } else {
                    messageBuffer.addMessage('Continuing Claude session...', 'status')
                    logger.debug(`[remote]: Continuing existing session: ${session.sessionId}`)
                }

                previousSessionId = session.sessionId
                const controller = new AbortController()
                this.abortController = controller
                this.abortFuture = new Future<void>()
                let modeHash: string | null = null
                let mode: EnhancedMode | null = null
                let turnNeedsReady = false
                const readyScheduler = createReadyEventScheduler({
                    label: '[remote]',
                    hasPending: () => pending !== null,
                    queueSize: () => session.queue.size(),
                    shouldExit: () => Boolean(this.exitReason),
                    flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
                    sendReady: () => {
                        session.client.sendSessionEvent({ type: 'ready' })
                    },
                })
                try {
                    await claudeRemote({
                        sessionId: session.sessionId,
                        path: session.path,
                        allowedTools: session.allowedTools ?? [],
                        mcpServers: session.mcpServers,
                        hookSettingsPath: session.hookSettingsPath,
                        canCallTool: permissionHandler.handleToolCall,
                        isAborted: (toolCallId: string) => {
                            return permissionHandler.isAborted(toolCallId)
                        },
                        nextMessage: async () => {
                            if (pending) {
                                let p = pending
                                pending = null
                                permissionHandler.handleModeChange(p.mode.permissionMode)
                                return p
                            }

                            let msg = await session.queue.waitForMessagesAndGetAsString(controller.signal)

                            if (msg) {
                                if ((modeHash && msg.hash !== modeHash) || msg.isolate) {
                                    logger.debug('[remote]: mode has changed, pending message')
                                    pending = msg
                                    return null
                                }
                                modeHash = msg.hash
                                mode = msg.mode
                                turnNeedsReady = true
                                permissionHandler.handleModeChange(mode.permissionMode)
                                return {
                                    message: msg.message,
                                    mode: msg.mode,
                                }
                            }

                            return null
                        },
                        onDiscoveredSessionId: (sessionId) => {
                            reportDiscoveredSessionId(session.onSessionFound, sessionId)
                        },
                        onThinkingChange: session.onThinkingChange,
                        claudeEnvVars: session.claudeEnvVars,
                        claudeArgs: session.claudeArgs,
                        onMessage,
                        onCompletionEvent: (message: string) => {
                            logger.debug(`[remote]: Completion event: ${message}`)
                            session.client.sendSessionEvent({ type: 'message', message })
                        },
                        onSessionReset: () => {
                            logger.debug('[remote]: Session reset')
                            session.clearSessionId()
                        },
                        onReady: () => {
                            turnNeedsReady = false
                            readyScheduler.emitDetached()
                        },
                        signal: controller.signal,
                    })

                    session.consumeOneTimeFlags()

                    if (!this.exitReason && controller.signal.aborted) {
                        session.client.sendSessionEvent({ type: 'message', message: 'Aborted by user' })
                    }
                } catch (e) {
                    logger.debug('[remote]: launch error', e)
                    if (!this.exitReason) {
                        surfaceTerminalFailure({
                            error: e,
                            fallbackMessage: 'Process exited unexpectedly',
                            sendSessionMessage: (message) =>
                                session.client.sendSessionEvent({ type: 'message', message }),
                            addStatusMessage: (message) => messageBuffer.addMessage(message, 'status'),
                        })
                        continue
                    }
                } finally {
                    logger.debug('[remote]: launch finally')

                    messageFlow.flushInterruptedToolCalls()

                    logger.debug('[remote]: flushing message queue')
                    await flushClaudeRemotePendingOutput(messageQueue, messageFlow)
                    logger.debug('[remote]: message queue flushed')
                    if (turnNeedsReady) {
                        await readyScheduler.emitNow()
                        turnNeedsReady = false
                    }

                    this.abortController = null
                    this.abortFuture?.resolve(undefined)
                    this.abortFuture = null
                    logger.debug('[remote]: launch done')
                    readyScheduler.dispose()
                    permissionHandler.reset()
                    modeHash = null
                    mode = null
                }
            }
        } finally {
            if (this.permissionHandler) {
                this.permissionHandler.reset()
            }
        }
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager)
        this.session.setRuntimeStopHandler(null)

        if (this.handleSessionFound) {
            this.session.removeSessionFoundCallback(this.handleSessionFound)
            this.handleSessionFound = null
        }

        if (this.permissionHandler) {
            this.permissionHandler.reset()
        }

        if (this.abortFuture) {
            this.abortFuture.resolve(undefined)
        }
    }
}

export async function claudeRemoteLauncher(session: Session): Promise<RemoteLauncherExitReason> {
    const launcher = new ClaudeRemoteLauncher(session)
    return launcher.launch()
}
