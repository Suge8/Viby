import { randomUUID } from 'node:crypto'
import { CopilotClient } from '@github/copilot-sdk'
import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { mergePromptSegments, prependPromptInstructionsToMessage } from '@/agent/promptInstructions'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { settleTerminalTurn, surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import { RemoteLauncherBase, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase'
import { logger } from '@/ui/logger'
import { runDetachedTask } from '@/utils/runDetachedTask'
import {
    attachCopilotSdkSession,
    disconnectCopilotSdkSession,
    isCopilotSessionMissingError,
} from './copilotSessionLifecycle'
import type { CopilotSession } from './session'
import { CopilotPermissionHandler } from './utils/permissionHandler'

class CopilotRemoteLauncher extends RemoteLauncherBase {
    private readonly session: CopilotSession
    private abortController = new AbortController()
    private sdkClient: CopilotClient | null = null
    private permissionHandler: CopilotPermissionHandler | null = null

    constructor(session: CopilotSession) {
        super(process.env.DEBUG ? session.logPath : undefined)
        this.session = session
        this.session.setRuntimeStopHandler(() => this.requestStop())
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        return this.start()
    }

    protected async abortForStop(): Promise<void> {
        await this.handleAbort()
    }

    protected async runMainLoop(): Promise<void> {
        const session = this.session
        const messageBuffer = this.messageBuffer

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
        })

        const sendReady = (): void => {
            session.sendSessionEvent({ type: 'ready' })
        }
        const readyScheduler = createReadyEventScheduler({
            label: '[copilot-remote]',
            queueSize: () => session.queue.size(),
            shouldExit: () => this.shouldExit,
            flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
            sendReady,
        })

        // Start the Copilot CLI process via SDK
        const client = new CopilotClient({ useStdio: true })
        this.sdkClient = client
        await client.start()

        // Build permission handler — registers 'permission' RPC once, reads mode dynamically
        const permHandler = new CopilotPermissionHandler(session)
        this.permissionHandler = permHandler
        const permissionHandler = permHandler.buildHandler()

        try {
            // Main message loop — single owner of turn lifecycle
            while (!this.shouldExit) {
                const waitSignal = this.abortController.signal
                const batch = await session.queue.waitForMessagesAndGetAsString(waitSignal)

                if (!batch) {
                    if (waitSignal.aborted && !this.shouldExit) {
                        continue
                    }
                    break
                }

                const { message, mode } = batch

                const messageInstructions = (() => {
                    return mergePromptSegments(mode.developerInstructions)
                })()
                const messageText = prependPromptInstructionsToMessage(message, messageInstructions)

                messageBuffer.addMessage(message, 'user')
                session.onThinkingChange(true)

                try {
                    await this.runTurn({
                        client,
                        permissionHandler,
                        messageText,
                        waitSignal,
                    })
                } catch (error) {
                    logger.warn('[copilot-remote] Send failed:', error)
                    surfaceTerminalFailure({
                        error,
                        fallbackMessage: 'Copilot failed. Check logs for details.',
                        detailPrefix: 'Copilot failed',
                        sendSessionMessage: (message) => session.sendSessionEvent({ type: 'message', message }),
                        addStatusMessage: (message) => messageBuffer.addMessage(message, 'status'),
                    })
                } finally {
                    await settleTerminalTurn({
                        setThinking: (thinking) => session.onThinkingChange(thinking),
                        emitReady: async () => await readyScheduler.emitNow(),
                    })
                }
            }
        } finally {
            readyScheduler.dispose()
        }
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager)
        this.session.setRuntimeStopHandler(null)
        this.abortController.abort()
        await this.permissionHandler?.cancelAll('Session ended')
        this.permissionHandler = null

        try {
            await this.sdkClient?.stop()
        } catch (err) {
            logger.warn('[copilot-remote] SDK client stop error:', err)
        }
        this.sdkClient = null
    }

    private async handleAbort(): Promise<void> {
        this.session.queue.reset()
        this.session.onThinkingChange(false)
        await this.permissionHandler?.cancelAll('Turn aborted')
        this.abortController.abort()
        this.abortController = new AbortController()
        this.messageBuffer.addMessage('Turn aborted', 'status')
    }

    private async runTurn(options: {
        client: CopilotClient
        permissionHandler: ReturnType<CopilotPermissionHandler['buildHandler']>
        messageText: string
        waitSignal: AbortSignal
    }): Promise<void> {
        let retriedMissingSession = false

        while (true) {
            const sdkSession = await attachCopilotSdkSession({
                client: options.client,
                session: this.session,
                permissionHandler: options.permissionHandler,
                reportSessionId: (sessionId) => {
                    reportDiscoveredSessionId(this.session.onSessionFound, sessionId)
                },
            })
            let deltaBuffer = ''
            let emittedTurnOutput = false

            const unsubToolStart = sdkSession.on('tool.execution_start', (event) => {
                emittedTurnOutput = true
                this.session.sendCodexMessage({
                    type: 'tool-call',
                    name: event.data.toolName,
                    callId: event.data.toolCallId,
                    input: event.data.arguments ?? {},
                    status: 'in_progress',
                })
                this.messageBuffer.addMessage(`Tool: ${event.data.toolName}`, 'tool')
            })

            const unsubToolComplete = sdkSession.on('tool.execution_complete', (event) => {
                emittedTurnOutput = true
                this.session.sendCodexMessage({
                    type: 'tool-call-result',
                    callId: event.data.toolCallId,
                    output: event.data.result?.detailedContent ?? event.data.result?.content ?? '',
                    is_error: !event.data.success,
                })
            })

            const unsubDelta = sdkSession.on('assistant.message_delta', (event) => {
                emittedTurnOutput = true
                deltaBuffer += event.data.deltaContent
                this.messageBuffer.addMessage(event.data.deltaContent, 'assistant')
            })

            const unsubMessage = sdkSession.on('assistant.message', (event) => {
                emittedTurnOutput = true
                const content = deltaBuffer || event.data.content
                if (!deltaBuffer) {
                    this.messageBuffer.addMessage(content, 'assistant')
                }
                this.session.sendCodexMessage({ type: 'message', id: randomUUID(), message: content })
                deltaBuffer = ''
            })

            let turnResolve!: () => void
            const turnDone = new Promise<void>((resolve) => {
                turnResolve = resolve
            })
            const unsubIdle = sdkSession.on('session.idle', () => {
                turnResolve()
            })

            const cleanupListeners = (): void => {
                unsubIdle()
                unsubMessage()
                unsubDelta()
                unsubToolComplete()
                unsubToolStart()
            }

            const abortHandler = (): void => {
                runDetachedTask(() => sdkSession.abort(), '[copilot-remote] Abort failed')
                deltaBuffer = ''
                cleanupListeners()
                turnResolve()
            }
            options.waitSignal.addEventListener('abort', abortHandler, { once: true })

            try {
                await sdkSession.send({ prompt: options.messageText })
                await turnDone
                return
            } catch (error) {
                if (options.waitSignal.aborted) {
                    return
                }

                if (!retriedMissingSession && !emittedTurnOutput && isCopilotSessionMissingError(error)) {
                    retriedMissingSession = true
                    logger.warn(
                        '[copilot-remote] Session vanished before turn start; reattaching durable session:',
                        error
                    )
                    continue
                }

                throw error
            } finally {
                options.waitSignal.removeEventListener('abort', abortHandler)
                cleanupListeners()
                await disconnectCopilotSdkSession(sdkSession).catch((error) => {
                    if (!isCopilotSessionMissingError(error)) {
                        logger.warn('[copilot-remote] Disconnect failed:', error)
                    }
                })
            }
        }
    }
}

export async function copilotRemoteLauncher(session: CopilotSession): Promise<RemoteLauncherExitReason> {
    const launcher = new CopilotRemoteLauncher(session)
    return launcher.launch()
}
