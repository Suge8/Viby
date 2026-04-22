import { forwardAcpAgentMessage, toAcpMcpServers } from '@/agent/acpAgentInterop'
import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { mergePromptSegments, prependPromptInstructionsToMessage } from '@/agent/promptInstructions'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { settleTerminalTurn, surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import type { AgentMessage, PromptContent } from '@/agent/types'
import { RemoteLauncherBase, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase'
import { logger } from '@/ui/logger'
import type { GeminiSession } from './session'
import type { GeminiMode, PermissionMode } from './types'
import type { createGeminiBackend } from './utils/geminiBackend'
import { GeminiPermissionHandler } from './utils/permissionHandler'

const GEMINI_ACP_AUTO_MODEL_ID = 'auto'

class GeminiRemoteLauncher extends RemoteLauncherBase {
    private readonly session: GeminiSession
    private readonly model?: string
    private readonly hookSettingsPath?: string
    private permissionHandler: GeminiPermissionHandler | null = null
    private abortController = new AbortController()
    private displayModel: string | null = null
    private displayPermissionMode: PermissionMode | null = null

    constructor(session: GeminiSession, opts: { model?: string; hookSettingsPath?: string }) {
        super(process.env.DEBUG ? session.logPath : undefined)
        this.session = session
        this.model = opts.model
        this.hookSettingsPath = opts.hookSettingsPath
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
        const mcpServerList = toAcpMcpServers(mcpServers)
        let activeAcpSessionId: string | null = null
        let activeModeKey: string | null = null

        const getModeKey = (mode: GeminiMode): string =>
            JSON.stringify({
                permissionMode: mode.permissionMode,
                model: mode.model ?? null,
            })
        const createOrResumeBackendSession = async (
            backend: ReturnType<typeof createGeminiBackend>
        ): Promise<{ sessionId: string; loadedSession: boolean }> => {
            if (!session.sessionId) {
                const sessionId = await backend.newSession({
                    cwd: session.path,
                    mcpServers: mcpServerList,
                })
                return {
                    sessionId,
                    loadedSession: false,
                }
            }

            try {
                const sessionId = await backend.loadSession({
                    sessionId: session.sessionId,
                    cwd: session.path,
                    mcpServers: mcpServerList,
                })
                return {
                    sessionId,
                    loadedSession: true,
                }
            } catch (error) {
                logger.warn('[gemini-remote] resume failed, starting new session', error)
                session.sendSessionEvent({
                    type: 'message',
                    message: 'Gemini resume failed; starting a new session.',
                })
                const sessionId = await backend.newSession({
                    cwd: session.path,
                    mcpServers: mcpServerList,
                })
                return {
                    sessionId,
                    loadedSession: false,
                }
            }
        }

        const ensureBackendForMode = async (mode: GeminiMode): Promise<string> => {
            const nextModeKey = getModeKey(mode)
            if (this.permissionHandler && activeAcpSessionId && activeModeKey === nextModeKey) {
                return activeAcpSessionId
            }

            if (this.permissionHandler) {
                await this.permissionHandler.cancelAll('Gemini backend reconfigured')
                this.permissionHandler = null
            }

            const backend = await session.ensureRemoteBackend({
                model: mode.model,
                hookSettingsPath: this.hookSettingsPath,
                permissionMode: mode.permissionMode,
            })

            backend.onStderrError((error) => {
                logger.debug('[gemini-remote] stderr error', error)
                session.sendSessionEvent({ type: 'message', message: error.message })
                messageBuffer.addMessage(error.message, 'status')
            })

            await backend.initialize()
            const { sessionId: acpSessionId, loadedSession } = await createOrResumeBackendSession(backend)
            if (loadedSession) {
                await backend.setSessionModel(acpSessionId, mode.model ?? GEMINI_ACP_AUTO_MODEL_ID)
            }

            reportDiscoveredSessionId(session.onSessionFound, acpSessionId)
            this.permissionHandler = new GeminiPermissionHandler(
                session.client,
                backend,
                () => session.getPermissionMode() as PermissionMode | undefined
            )
            activeAcpSessionId = acpSessionId
            activeModeKey = nextModeKey
            this.applyDisplayMode(mode.permissionMode, mode.model)
            return acpSessionId
        }

        const initialMode: GeminiMode = {
            permissionMode: (session.getPermissionMode() as PermissionMode | undefined) ?? 'default',
            model: session.getModel() ?? this.model,
        }
        await ensureBackendForMode(initialMode)

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
        })

        const sendReady = () => {
            session.sendSessionEvent({ type: 'ready' })
        }
        const readyScheduler = createReadyEventScheduler({
            label: '[gemini-remote]',
            queueSize: () => session.queue.size(),
            shouldExit: () => this.shouldExit,
            flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
            sendReady,
        })

        const preparePromptText = (message: string, mode: GeminiMode): string => {
            return prependPromptInstructionsToMessage(message, mergePromptSegments(mode.developerInstructions))
        }

        while (!this.shouldExit) {
            const batch = await session.queue.waitForMessagesAndGetAsString(this.abortController.signal)
            if (!batch) {
                if (this.abortController.signal.aborted && !this.shouldExit) {
                    continue
                }
                break
            }

            const acpSessionId = await ensureBackendForMode(batch.mode)
            messageBuffer.addMessage(batch.message, 'user')

            const promptContent: PromptContent[] = [
                {
                    type: 'text',
                    text: preparePromptText(batch.message, batch.mode),
                },
            ]

            session.onThinkingChange(true)

            try {
                const backend = await session.ensureRemoteBackend({
                    model: batch.mode.model,
                    hookSettingsPath: this.hookSettingsPath,
                    permissionMode: batch.mode.permissionMode,
                })
                await backend.prompt(acpSessionId, promptContent, (message: AgentMessage) => {
                    this.handleAgentMessage(message)
                })
            } catch (error) {
                logger.warn('[gemini-remote] prompt failed', error)
                surfaceTerminalFailure({
                    error,
                    fallbackMessage: 'Gemini prompt failed. Check logs for details.',
                    detailPrefix: 'Gemini prompt failed',
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

    private applyDisplayMode(permissionMode: PermissionMode | undefined, model?: string): void {
        if (permissionMode && permissionMode !== this.displayPermissionMode) {
            this.displayPermissionMode = permissionMode
            this.messageBuffer.addMessage(`[MODE:${permissionMode}]`, 'system')
        }
        if (model && model !== this.displayModel) {
            this.displayModel = model
            this.messageBuffer.addMessage(`[MODEL:${model}]`, 'system')
        }
    }

    private async handleAbort(): Promise<void> {
        const backend = this.session.getRemoteBackend()
        if (backend && this.session.sessionId) {
            await backend.cancelPrompt(this.session.sessionId)
        }
        await this.permissionHandler?.cancelAll('User aborted')
        this.session.sendSessionEvent({ type: 'message', message: 'Session aborted' })
        this.session.queue.reset()
        this.session.onThinkingChange(false)
        this.abortController.abort()
        this.abortController = new AbortController()
        this.messageBuffer.addMessage('Turn aborted', 'status')
    }
}

export async function geminiRemoteLauncher(
    session: GeminiSession,
    opts: { model?: string; hookSettingsPath?: string }
): Promise<RemoteLauncherExitReason> {
    const launcher = new GeminiRemoteLauncher(session, opts)
    return launcher.launch()
}
