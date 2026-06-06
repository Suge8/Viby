import { AssistantStreamBridge } from '@/agent/assistantStreamBridge'
import { runRuntimeTurnOwner } from '@/agent/runtimeTurnOwner'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { parseSpecialCommand } from '@/parsers/specialCommands'
import type { MessageBuffer } from '@/ui/ink/messageBuffer'
import { logger } from '@/ui/logger'
import type { CodexAppServerClient } from './codexAppServerClient'
import { createCodexEventHandler } from './codexRemoteEventHandler'
import { buildCodexPermissionBridgeHandlers } from './codexRemotePermissionBridge'
import { registerCodexNotificationHandler, warmupCodexRemoteThread } from './codexRemoteRuntime'
import { type CodexRemoteRuntimeState, logActiveHandles, type QueuedMessage } from './codexRemoteSupport'
import { ensureCodexRemoteThreadReady } from './codexRemoteThreadOwner'
import {
    abortCodexTurn,
    applyTurnStartResponse,
    cleanupCodexTurn,
    recoverFromTurnStartError,
} from './codexRemoteTurnLifecycle'
import type { EnhancedMode } from './loop'
import type { CodexSession } from './session'
import { buildTurnStartParams } from './utils/appServerConfig'
import { AppServerEventConverter } from './utils/appServerEventConverter'
import { registerAppServerPermissionHandlers } from './utils/appServerPermissionAdapter'
import { DiffProcessor } from './utils/diffProcessor'
import { CodexPermissionHandler } from './utils/permissionHandler'
import { ReasoningProcessor } from './utils/reasoningProcessor'
import { getCodexThreadMode } from './utils/threadWarmup'

const CODEX_COMPACT_SUCCESS_MESSAGE = 'Conversation compacted.'
const CODEX_CLEAR_REDIRECT_MESSAGE = 'Open a new Viby session to clear Codex context.'

export class CodexRemoteCoordinator {
    readonly session: CodexSession
    readonly appServerClient: CodexAppServerClient
    readonly messageBuffer: MessageBuffer
    readonly state: CodexRemoteRuntimeState = {
        currentThreadId: null,
        currentTurnId: null,
        activeChildTurns: new Map(),
        suppressedTurnIds: [],
        suppressAnonymousTurnEvents: false,
        turnInFlight: false,
        allowAnonymousTerminalEvent: false,
    }
    abortController: AbortController = new AbortController()
    permissionHandler: CodexPermissionHandler | null = null
    reasoningProcessor: ReasoningProcessor | null = null
    diffProcessor: DiffProcessor | null = null
    private hasThread = false
    private resolveTurnSettledWaiter: (() => void) | null = null
    private readonly assistantStream: AssistantStreamBridge

    constructor(session: CodexSession, appServerClient: CodexAppServerClient, messageBuffer: MessageBuffer) {
        this.session = session
        this.appServerClient = appServerClient
        this.messageBuffer = messageBuffer
        this.assistantStream = new AssistantStreamBridge({
            append: ({ assistantTurnId, delta }) =>
                this.session.sendStreamUpdate({
                    kind: 'append',
                    assistantTurnId,
                    delta,
                }),
            clear: ({ assistantTurnId }) =>
                this.session.sendStreamUpdate(assistantTurnId ? { kind: 'clear', assistantTurnId } : { kind: 'clear' }),
        })
    }

    async handleAbort(): Promise<void> {
        await abortCodexTurn({
            state: this.state,
            appServerClient: this.appServerClient,
            abortController: this.abortController,
            resetQueue: () => this.session.queue.reset(),
            clearAssistantStream: () => this.assistantStream.clearDanglingAssistantTurn(),
            resetPermissionHandler: () => this.permissionHandler?.reset(),
            abortReasoning: () => this.reasoningProcessor?.abort(),
            resetDiff: () => this.diffProcessor?.reset(),
            notifyTurnSettled: () => this.notifyTurnSettled(),
            replaceAbortController: (nextController) => {
                ;(this as { abortController: AbortController }).abortController = nextController
            },
        })
    }

    private notifyTurnSettled(): void {
        if (!this.isTurnSettled()) {
            return
        }
        const waiter = this.resolveTurnSettledWaiter
        this.resolveTurnSettledWaiter = null
        waiter?.()
    }

    private async waitUntilReadyForNextTurn(): Promise<void> {
        if (this.isTurnSettled()) {
            return
        }

        await new Promise<void>((resolve) => {
            if (this.isTurnSettled()) {
                resolve()
                return
            }
            this.resolveTurnSettledWaiter = resolve
        })
    }

    private isTurnSettled(): boolean {
        return !this.state.turnInFlight && this.state.activeChildTurns.size === 0
    }

    private bindThreadId(threadId: string): void {
        this.state.currentThreadId = threadId
        reportDiscoveredSessionId(this.session.onSessionFound, threadId)
    }

    private async ensureThreadReady(mode: EnhancedMode, options?: { logIfMissing?: boolean }): Promise<string> {
        return await ensureCodexRemoteThreadReady({
            session: this.session,
            appServerClient: this.appServerClient,
            mode,
            abortSignal: this.abortController.signal,
            currentThreadId: this.state.currentThreadId,
            hasThread: this.hasThread,
            logIfMissing: options?.logIfMissing,
            onModelResolved: (resolvedModel) => this.session.setModel(resolvedModel),
            onThreadReady: (threadId) => {
                this.bindThreadId(threadId)
                this.hasThread = true
            },
        })
    }

    private async handleQueuedSpecialCommand(message: QueuedMessage): Promise<boolean> {
        const command = parseSpecialCommand(message.message)
        if (!command.type) {
            return false
        }

        this.messageBuffer.addMessage(message.message, 'user')
        switch (command.type) {
            case 'clear':
                this.session.sendSessionEvent({ type: 'message', message: CODEX_CLEAR_REDIRECT_MESSAGE })
                return true
            case 'compact':
                await this.compactThread(message.mode)
                return true
            default:
                return false
        }
    }

    private async compactThread(mode: EnhancedMode): Promise<void> {
        this.session.onThinkingChange(true)
        try {
            const threadId = await this.ensureThreadReady(getCodexThreadMode(this.session, mode), {
                logIfMissing: !this.state.currentThreadId,
            })
            const response = await this.appServerClient.compactThread(
                { threadId },
                { signal: this.abortController.signal }
            )
            const nextThreadId = response.thread?.id
            if (nextThreadId) {
                this.bindThreadId(nextThreadId)
                this.hasThread = true
            }
            this.session.sendSessionEvent({ type: 'message', message: CODEX_COMPACT_SUCCESS_MESSAGE })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown compaction failure'
            logger.debug('[Codex] Compact command failed', error)
            this.session.sendSessionEvent({ type: 'message', message: `Compaction failed: ${message}` })
        } finally {
            this.session.onThinkingChange(false)
        }
    }

    async runMainLoop(shouldExit: () => boolean): Promise<void> {
        const permissionHandler = new CodexPermissionHandler(
            this.session.client,
            () => {
                const mode = this.session.getPermissionMode()
                return mode === 'default' || mode === 'read-only' || mode === 'safe-yolo' || mode === 'yolo'
                    ? mode
                    : undefined
            },
            buildCodexPermissionBridgeHandlers(this.session)
        )
        const reasoningProcessor = new ReasoningProcessor((message) => {
            this.session.sendCodexMessage(message)
        })
        const diffProcessor = new DiffProcessor((message) => {
            this.session.sendCodexMessage(message)
        })
        const appServerEventConverter = new AppServerEventConverter()
        this.permissionHandler = permissionHandler
        this.reasoningProcessor = reasoningProcessor
        this.diffProcessor = diffProcessor

        registerAppServerPermissionHandlers({
            client: this.appServerClient,
            permissionHandler,
            onUserInputRequest: async ({ requestId, input }) =>
                await permissionHandler.handleUserInputRequest(requestId, input),
        })

        const handleCodexEvent = createCodexEventHandler({
            session: this.session,
            state: this.state,
            messageBuffer: this.messageBuffer,
            reasoningProcessor,
            diffProcessor,
            bindThreadId: (threadId) => this.bindThreadId(threadId),
            appendAssistantStream: (assistantTurnId, delta) =>
                this.assistantStream.appendTextDelta(delta, assistantTurnId),
            acknowledgeAssistantTurn: (assistantTurnId) => this.assistantStream.acknowledgeDurableTurn(assistantTurnId),
            notifyTurnSettled: () => this.notifyTurnSettled(),
        })

        registerCodexNotificationHandler({
            appServerClient: this.appServerClient,
            state: this.state,
            appServerEventConverter,
            handleCodexEvent,
            notifyTurnSettled: () => this.notifyTurnSettled(),
        })

        await this.appServerClient.connect()
        await this.appServerClient.initialize({
            clientInfo: { name: 'viby-codex-client', version: '1.0.0' },
            capabilities: { experimentalApi: true },
        })

        await warmupCodexRemoteThread({
            session: this.session,
            state: this.state,
            ensureThreadReady: async (logIfMissing) =>
                await this.ensureThreadReady(getCodexThreadMode(this.session), {
                    logIfMissing,
                }),
            resetThreadState: () => {
                this.state.currentThreadId = null
                this.hasThread = false
            },
        })

        await runRuntimeTurnOwner<QueuedMessage>({
            label: '[codex-remote]',
            sessionClient: this.session.client,
            queueSize: () => this.session.queue.size(),
            shouldExit,
            sendReady: () => this.session.sendSessionEvent({ type: 'ready' }),
            getAbortSignal: () => this.abortController.signal,
            waitForTurn: async (signal) => {
                logActiveHandles('loop-top')
                return await this.session.queue.waitForMessagesAndGetAsString(signal)
            },
            beforeTurn: async (message) => {
                if (await this.handleQueuedSpecialCommand(message)) {
                    return { type: 'handled' }
                }
                this.messageBuffer.addMessage(message.message, 'user')
                return { type: 'continue', prepared: message }
            },
            runTurn: async (message) => {
                this.state.suppressAnonymousTurnEvents = false
                this.state.currentThreadId = await this.ensureThreadReady(
                    getCodexThreadMode(this.session, message.mode),
                    {
                        logIfMissing: !this.state.currentThreadId,
                    }
                )

                const turnMode = {
                    ...message.mode,
                    model: this.session.getModel() ?? message.mode.model,
                    modelReasoningEffort: this.session.getModelReasoningEffort() ?? message.mode.modelReasoningEffort,
                    codexServiceTier: this.session.getCodexServiceTier() ?? message.mode.codexServiceTier,
                }
                this.state.turnInFlight = true
                this.state.allowAnonymousTerminalEvent = false
                const turnResponse = await this.appServerClient.startTurn(
                    buildTurnStartParams({
                        threadId: this.state.currentThreadId,
                        message: message.message,
                        cwd: this.session.path,
                        mode: turnMode,
                        cliOverrides: this.session.codexCliOverrides,
                        developerInstructions: turnMode.developerInstructions,
                    }),
                    { signal: this.abortController.signal }
                )
                applyTurnStartResponse(this.state, turnResponse)
            },
            onTurnError: (error) => {
                recoverFromTurnStartError({
                    error,
                    state: this.state,
                    messageBuffer: this.messageBuffer,
                    clearAssistantStream: () => this.assistantStream.clearDanglingAssistantTurn(),
                    notifyTurnSettled: () => this.notifyTurnSettled(),
                    sendSessionMessage: (message) => this.session.sendSessionEvent({ type: 'message', message }),
                    resetThreadState: () => {
                        this.state.currentThreadId = null
                        this.hasThread = false
                    },
                })
            },
            afterTurn: async () => {
                await cleanupCodexTurn({
                    clearAssistantStream: () => this.assistantStream.clearDanglingAssistantTurn(),
                    resetPermissionHandler: () => permissionHandler.reset(),
                    abortReasoning: () => reasoningProcessor.abort(),
                    resetDiff: () => diffProcessor.reset(),
                    resetEventConverter: () => appServerEventConverter.reset(),
                })
                logActiveHandles('after-turn')
            },
            waitUntilReadyForNextTurn: async () => await this.waitUntilReadyForNextTurn(),
            setThinking: (thinking) => this.session.onThinkingChange(thinking),
        })
    }

    async cleanup(): Promise<void> {
        this.appServerClient.setNotificationHandler(null)
        this.permissionHandler?.reset()
        this.reasoningProcessor?.abort()
        this.diffProcessor?.reset()
        this.permissionHandler = null
        this.reasoningProcessor = null
        this.diffProcessor = null
    }
}
