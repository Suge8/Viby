import { forwardAcpAgentMessage, toAcpMcpServers } from '@/agent/acpAgentInterop'
import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { mergePromptSegments, prependPromptInstructionsToMessage } from '@/agent/promptInstructions'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { settleTerminalTurn, surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import type { AgentMessage, PromptContent } from '@/agent/types'
import { RemoteLauncherBase, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase'
import { logger } from '@/ui/logger'
import type { OpencodeSession } from './session'
import type { OpencodeMode, PermissionMode } from './types'
import { OpencodePermissionHandler } from './utils/permissionHandler'

class OpencodeRemoteLauncher extends RemoteLauncherBase {
    private readonly session: OpencodeSession
    private permissionHandler: OpencodePermissionHandler | null = null
    private abortController = new AbortController()
    private displayPermissionMode: PermissionMode | null = null

    constructor(session: OpencodeSession) {
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

        const { mcpServers } = await session.ensureRemoteBridge()
        const backend = session.ensureRemoteBackend()

        backend.onStderrError((error) => {
            logger.debug('[opencode-remote] stderr error', error)
            session.sendSessionEvent({ type: 'message', message: error.message })
            messageBuffer.addMessage(error.message, 'status')
        })

        await backend.initialize()

        const resumeSessionId = session.sessionId
        const mcpServerList = toAcpMcpServers(mcpServers)
        let acpSessionId: string
        if (resumeSessionId) {
            try {
                acpSessionId = await backend.loadSession({
                    sessionId: resumeSessionId,
                    cwd: session.path,
                    mcpServers: mcpServerList,
                })
            } catch (error) {
                logger.warn('[opencode-remote] resume failed, starting new session', error)
                session.sendSessionEvent({
                    type: 'message',
                    message: 'OpenCode resume failed; starting a new session.',
                })
                acpSessionId = await backend.newSession({
                    cwd: session.path,
                    mcpServers: mcpServerList,
                })
            }
        } else {
            acpSessionId = await backend.newSession({
                cwd: session.path,
                mcpServers: mcpServerList,
            })
        }
        reportDiscoveredSessionId(session.onSessionFound, acpSessionId)

        this.permissionHandler = new OpencodePermissionHandler(
            session.client,
            backend,
            () => session.getPermissionMode() as PermissionMode | undefined
        )
        this.applyDisplayMode(session.getPermissionMode() as PermissionMode)

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
        })

        const sendReady = () => {
            session.sendSessionEvent({ type: 'ready' })
        }
        const readyScheduler = createReadyEventScheduler({
            label: '[opencode-remote]',
            queueSize: () => session.queue.size(),
            shouldExit: () => this.shouldExit,
            flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
            sendReady,
        })

        const preparePromptText = (message: string, mode: OpencodeMode): string => {
            return prependPromptInstructionsToMessage(message, mergePromptSegments(mode.developerInstructions))
        }

        while (!this.shouldExit) {
            const waitSignal = this.abortController.signal
            const batch = await session.queue.waitForMessagesAndGetAsString(waitSignal)
            if (!batch) {
                if (waitSignal.aborted && !this.shouldExit) {
                    continue
                }
                break
            }

            this.applyDisplayMode(batch.mode.permissionMode)
            messageBuffer.addMessage(batch.message, 'user')

            const messageText = preparePromptText(batch.message, batch.mode)

            const promptContent: PromptContent[] = [
                {
                    type: 'text',
                    text: messageText,
                },
            ]

            session.onThinkingChange(true)

            try {
                await backend.prompt(acpSessionId, promptContent, (message: AgentMessage) => {
                    this.handleAgentMessage(message)
                })
            } catch (error) {
                logger.warn('[opencode-remote] prompt failed', error)
                surfaceTerminalFailure({
                    error,
                    fallbackMessage: 'OpenCode prompt failed. Check logs for details.',
                    detailPrefix: 'OpenCode prompt failed',
                    sendSessionMessage: (message) => session.sendSessionEvent({ type: 'message', message }),
                    addStatusMessage: (message) => messageBuffer.addMessage(message, 'status'),
                })
            } finally {
                await settleTerminalTurn({
                    setThinking: (thinking) => session.onThinkingChange(thinking),
                    afterThinkingCleared: async () => {
                        await this.permissionHandler?.cancelAll('Prompt finished')
                    },
                    emitReady: async () => await readyScheduler.emitNow(),
                })
            }
        }

        readyScheduler.dispose()
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager)
        this.session.setRuntimeStopHandler(null)

        if (this.permissionHandler) {
            await this.permissionHandler.cancelAll('Session ended')
            this.permissionHandler = null
        }
    }

    private handleAgentMessage(message: AgentMessage): void {
        forwardAcpAgentMessage(message, {
            sendStructuredMessage: (converted) => this.session.sendCodexMessage(converted),
            addMessage: (text, role) => this.messageBuffer.addMessage(text, role),
        })
    }

    private applyDisplayMode(permissionMode: PermissionMode | undefined): void {
        if (permissionMode && permissionMode !== this.displayPermissionMode) {
            this.displayPermissionMode = permissionMode
            this.messageBuffer.addMessage(`[MODE:${permissionMode}]`, 'system')
        }
    }

    private async handleAbort(): Promise<void> {
        const backend = this.session.getRemoteBackend()
        if (backend && this.session.sessionId) {
            await backend.cancelPrompt(this.session.sessionId)
        }
        await this.permissionHandler?.cancelAll('User aborted')
        this.session.queue.reset()
        this.session.onThinkingChange(false)
        this.abortController.abort()
        this.abortController = new AbortController()
        this.messageBuffer.addMessage('Turn aborted', 'status')
    }
}

export async function opencodeRemoteLauncher(session: OpencodeSession): Promise<RemoteLauncherExitReason> {
    const launcher = new OpencodeRemoteLauncher(session)
    return launcher.launch()
}
