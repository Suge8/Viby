import { AssistantStreamBridge } from '@/agent/assistantStreamBridge'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import type { MessageBuffer } from '@/ui/ink/messageBuffer'
import { logger } from '@/ui/logger'
import type { CodexAppServerClient } from './codexAppServerClient'
import { createCodexReadyScheduler } from './codexReadyScheduler'
import { createCodexEventHandler } from './codexRemoteEventHandler'
import { buildCodexPermissionBridgeHandlers } from './codexRemotePermissionBridge'
import { registerCodexNotificationHandler, warmupCodexRemoteThread } from './codexRemoteRuntime'
import { type CodexRemoteRuntimeState, logActiveHandles, type QueuedMessage } from './codexRemoteSupport'
import { ensureCodexRemoteThreadReady } from './codexRemoteThreadOwner'
import {
    abortCodexTurn,
    applyTurnStartResponse,
    finalizeIdleTurn,
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

const READY_AFTER_TURN_DELAY_MS = 120

export class CodexRemoteCoordinator {
    readonly session: CodexSession
    readonly appServerClient: CodexAppServerClient
    readonly messageBuffer: MessageBuffer
    readonly state: CodexRemoteRuntimeState = {
        currentThreadId: null,
        currentTurnId: null,
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
    private readyScheduler: ReturnType<typeof createCodexReadyScheduler> | null = null
    private pending: QueuedMessage | null = null
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
            setThinking: (thinking) => this.session.onThinkingChange(thinking),
            resetPermissionHandler: () => this.permissionHandler?.reset(),
            abortReasoning: () => this.reasoningProcessor?.abort(),
            resetDiff: () => this.diffProcessor?.reset(),
            replaceAbortController: (nextController) => {
                ;(this as { abortController: AbortController }).abortController = nextController
            },
        })
    }

    private notifyTurnSettled(): void {
        const waiter = this.resolveTurnSettledWaiter
        this.resolveTurnSettledWaiter = null
        waiter?.()
    }

    private async waitForTurnToSettle(): Promise<void> {
        if (!this.state.turnInFlight) {
            return
        }

        await new Promise<void>((resolve) => {
            if (!this.state.turnInFlight) {
                resolve()
                return
            }
            this.resolveTurnSettledWaiter = resolve
        })
    }

    private clearReadyAfterTurnTimer(): void {
        this.readyScheduler?.cancel()
    }

    private scheduleReadyAfterTurn(): void {
        this.readyScheduler?.schedule(READY_AFTER_TURN_DELAY_MS)
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
        this.readyScheduler = createCodexReadyScheduler(this.session, shouldExit, () => this.pending !== null)

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
            appServerEventConverter,
            bindThreadId: (threadId) => this.bindThreadId(threadId),
            clearAssistantStream: () => this.assistantStream.clearDanglingAssistantTurn(),
            appendAssistantStream: (assistantTurnId, delta) =>
                this.assistantStream.appendTextDelta(delta, assistantTurnId),
            acknowledgeAssistantTurn: (assistantTurnId) => this.assistantStream.acknowledgeDurableTurn(assistantTurnId),
            notifyTurnSettled: () => this.notifyTurnSettled(),
            scheduleReadyAfterTurn: () => this.scheduleReadyAfterTurn(),
            clearReadyAfterTurnTimer: () => this.clearReadyAfterTurnTimer(),
            hasReadyAfterTurnTimer: () => this.readyScheduler?.isScheduled() ?? false,
        })

        registerCodexNotificationHandler({
            appServerClient: this.appServerClient,
            state: this.state,
            appServerEventConverter,
            handleCodexEvent,
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

        while (!shouldExit()) {
            logActiveHandles('loop-top')
            let message = this.pending
            this.pending = null
            if (!message) {
                const batch = await this.session.queue.waitForMessagesAndGetAsString(this.abortController.signal)
                if (!batch) {
                    if (this.abortController.signal.aborted && !shouldExit()) {
                        continue
                    }
                    break
                }
                message = batch
            }

            if (!message) {
                break
            }

            if (this.state.turnInFlight) {
                this.pending = message
                await this.waitForTurnToSettle()
                continue
            }

            this.messageBuffer.addMessage(message.message, 'user')

            try {
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
            } catch (error) {
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
            } finally {
                await finalizeIdleTurn({
                    state: this.state,
                    clearAssistantStream: () => this.assistantStream.clearDanglingAssistantTurn(),
                    resetPermissionHandler: () => permissionHandler.reset(),
                    abortReasoning: () => reasoningProcessor.abort(),
                    resetDiff: () => diffProcessor.reset(),
                    resetEventConverter: () => appServerEventConverter.reset(),
                    setThinking: (thinking) => this.session.onThinkingChange(thinking),
                    clearReadyAfterTurnTimer: () => this.clearReadyAfterTurnTimer(),
                    emitReady: async () => await this.readyScheduler?.emitNow(),
                })
                logActiveHandles('after-turn')
            }
        }
    }

    async cleanup(): Promise<void> {
        this.appServerClient.setNotificationHandler(null)
        this.permissionHandler?.reset()
        this.reasoningProcessor?.abort()
        this.diffProcessor?.reset()
        this.readyScheduler?.dispose()
        this.permissionHandler = null
        this.reasoningProcessor = null
        this.diffProcessor = null
        this.readyScheduler = null
    }
}
