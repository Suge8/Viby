import { join } from 'node:path'

import { SESSION_RECOVERY_PAGE_SIZE, findNextRecoveryCursor } from '@viby/protocol'
import { bootstrapSession } from '@/agent/sessionFactory'
import { emitReadyIfIdle, flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle'
import { assertSessionConfigPayload, resolvePermissionModeForDriver } from '@/agent/providerConfig'
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler'
import type {
    AgentState,
    PiPermissionMode,
    SessionModel,
    SessionModelReasoningEffort,
    TeamSessionSpawnRole
} from '@/api/types'
import { logger } from '@/ui/logger'
import { hashObject } from '@/utils/deterministicJson'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'
import { getInvokedCwd } from '@/utils/invokedCwd'
import {
    type PiAssistantMessage,
    buildPiAssistantOutputRecord,
    getPiAssistantStreamId,
    type PiToolResultMessage,
    buildPiToolResultOutputRecord,
    clampPiThinkingLevel,
    formatPiModel,
    fromPiThinkingLevel,
    rehydratePiMessages,
    toPiThinkingLevel,
    type PiMessage,
    type PiThinkingLevel
} from './messageCodec'
import {
    normalizePiModelSelection,
    resolvePiModel,
    resolvePiScopedModelContext,
} from './launchConfig'
import { PiPermissionHandler } from './permissionHandler'
import { PiSession } from './session'
import type { PiMode } from './types'

type PiSdkModule = typeof import('@mariozechner/pi-coding-agent')
type PiSdkSession = Awaited<ReturnType<PiSdkModule['createAgentSession']>>['session']
type PiSdkSessionEvent = Parameters<PiSdkSession['subscribe']>[0] extends (event: infer TEvent) => void ? TEvent : never
type PiSdkModel = NonNullable<PiSdkSession['model']>
type PiSdkModelRegistry = ReturnType<PiSdkModule['ModelRegistry']['create']>
type PiSdkSessionManager = ReturnType<PiSdkModule['SessionManager']['inMemory']>
type PiBeforeToolCallHook = NonNullable<Parameters<PiSdkSession['agent']['setBeforeToolCall']>[0]>
type PiBeforeToolCallContext = Parameters<PiBeforeToolCallHook>[0]
type PiBeforeToolCallResult = Awaited<ReturnType<PiBeforeToolCallHook>>
type PiSdkSettingsManager = ReturnType<PiSdkModule['SettingsManager']['create']>

type PiRuntimeState = {
    permissionMode: PiPermissionMode
    model: SessionModel
    modelReasoningEffort: SessionModelReasoningEffort
}

type RecoveryMessagePage = Awaited<ReturnType<import('@/api/api').ApiClient['getSessionRecoveryPage']>>

function asPiThinkingLevels(levels: readonly string[]): readonly PiThinkingLevel[] {
    return levels as readonly PiThinkingLevel[]
}

async function recoverPiMessages(
    api: import('@/api/api').ApiClient,
    vibySessionId: string | undefined
): Promise<PiMessage[]> {
    if (!vibySessionId) {
        return []
    }

    const recoveredMessages: RecoveryMessagePage['messages'] = []
    let cursor = 0

    while (true) {
        const recoveryPage = await api.getSessionRecoveryPage({
            sessionId: vibySessionId,
            afterSeq: cursor,
            limit: SESSION_RECOVERY_PAGE_SIZE
        })

        const messages = recoveryPage.messages
        if (messages.length === 0) {
            break
        }

        recoveredMessages.push(...messages)

        const nextCursor = findNextRecoveryCursor(messages, cursor)
        if (nextCursor <= cursor || !recoveryPage.page.hasMore) {
            break
        }
        cursor = nextCursor
    }

    return rehydratePiMessages(recoveredMessages)
}

function preloadRecoveredMessages(
    sessionManager: PiSdkSessionManager,
    recoveredMessages: PiMessage[]
): void {
    for (const message of recoveredMessages) {
        sessionManager.appendMessage(message as Parameters<PiSdkSessionManager['appendMessage']>[0])
    }
}

function createModeHash(mode: PiMode): string {
    return hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort
    })
}

function getRuntimeStateFromPiSession(
    permissionMode: PiPermissionMode,
    session: PiSdkSession
): PiRuntimeState {
    return {
        permissionMode,
        model: formatPiModel(session.model),
        modelReasoningEffort: fromPiThinkingLevel(session.thinkingLevel)
    }
}

function syncRuntimeSnapshot(session: PiSession, runtimeState: PiRuntimeState): void {
    session.setPermissionMode(runtimeState.permissionMode)
    session.setModel(runtimeState.model)
    session.setModelReasoningEffort(runtimeState.modelReasoningEffort)
}

function applyThinkingLevel(
    session: PiSdkSession,
    requestedLevel: PiThinkingLevel
): PiThinkingLevel {
    const availableLevels = asPiThinkingLevels(session.getAvailableThinkingLevels())
    const nextLevel = clampPiThinkingLevel(requestedLevel, availableLevels)
    if (session.thinkingLevel !== nextLevel) {
        session.agent.state.thinkingLevel = nextLevel
        session.sessionManager.appendThinkingLevelChange(nextLevel)
    }
    return nextLevel
}

function applyModel(
    session: PiSdkSession,
    model: PiSdkModel
): void {
    const currentModel = session.model
    if (currentModel?.provider === model.provider && currentModel.id === model.id) {
        return
    }

    const currentThinkingLevel = session.thinkingLevel
    session.agent.state.model = model
    session.sessionManager.appendModelChange(model.provider, model.id)
    applyThinkingLevel(session, currentThinkingLevel as PiThinkingLevel)
}

function bindPermissionGate(
    piSession: PiSdkSession,
    permissionHandler: PiPermissionHandler
): void {
    const previousBeforeToolCall = (piSession.agent as unknown as {
        _beforeToolCall?: PiBeforeToolCallHook
    })._beforeToolCall

    piSession.agent.setBeforeToolCall(async (
        context: PiBeforeToolCallContext,
        signal?: AbortSignal
    ): Promise<PiBeforeToolCallResult> => {
        const { toolCall, args } = context
        const vibyDecision = await permissionHandler.handleToolCall(toolCall.id, toolCall.name, args)
        if (vibyDecision?.block) {
            return vibyDecision
        }

        return previousBeforeToolCall
            ? await previousBeforeToolCall(context, signal)
            : undefined
    })
}

function isAssistantMessage(message: unknown): message is PiAssistantMessage {
    return typeof message === 'object' && message !== null && 'role' in message && message.role === 'assistant'
}

function isToolResultMessage(message: unknown): message is PiToolResultMessage {
    return typeof message === 'object' && message !== null && 'role' in message && message.role === 'toolResult'
}

export async function runPi(opts: {
    startedBy?: 'runner' | 'terminal'
    vibySessionId?: string
    sessionRole?: TeamSessionSpawnRole
    permissionMode?: PiPermissionMode
    model?: string
    modelReasoningEffort?: SessionModelReasoningEffort
} = {}): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'

    logger.debug(`[pi] Starting with options: startedBy=${startedBy}`)

    const piSdk = await import('@mariozechner/pi-coding-agent') as PiSdkModule
    const agentDir = piSdk.getAgentDir()
    const authStorage = piSdk.AuthStorage.create(join(agentDir, 'auth.json'))
    const modelRegistry = piSdk.ModelRegistry.create(authStorage, join(agentDir, 'models.json'))
    const settingsManager = piSdk.SettingsManager.create(workingDirectory, agentDir) as PiSdkSettingsManager
    const selectableModels = modelRegistry.getAvailable()
    const enabledModelPatterns = settingsManager.getEnabledModels()
    const scopedModelContext = resolvePiScopedModelContext(selectableModels, enabledModelPatterns)
    const effectiveSelectablePiModels = scopedModelContext.effectiveSelectablePiModels
    const piModelCapabilities = scopedModelContext.piModelCapabilities

    const initialState: AgentState = {
        controlledByUser: false
    }

    const { api, session } = await bootstrapSession({
        driver: 'pi',
        sessionId: opts.vibySessionId,
        startedBy,
        workingDirectory,
        agentState: initialState,
        sessionRole: opts.sessionRole,
        permissionMode: opts.permissionMode ?? 'default',
        model: normalizePiModelSelection(opts.model),
        modelReasoningEffort: opts.modelReasoningEffort,
        metadataOverrides: {
            piModelScope: {
                models: piModelCapabilities
            }
        }
    })

    const startingMode: 'local' | 'remote' = startedBy === 'runner' ? 'remote' : 'local'
    setControlledByUser(session, startingMode)

    const messageQueue = new MessageQueue2<PiMode>(createModeHash)
    const piSession = new PiSession({
        api,
        client: session,
        path: workingDirectory,
        logPath: join(workingDirectory, '.pi', 'viby-pi.log'),
        sessionId: null,
        messageQueue,
        startedBy
    })

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'pi',
        stopKeepAlive: () => {
            messageQueue.close()
            piSession.stopKeepAlive()
        }
    })
    lifecycle.registerProcessHandlers()
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit)

    const recoveredMessages = await recoverPiMessages(api, opts.vibySessionId)
    const sessionManager = piSdk.SessionManager.inMemory(workingDirectory)
    preloadRecoveredMessages(sessionManager, recoveredMessages)

    const requestedModel = resolvePiModel(effectiveSelectablePiModels, opts.model)
    const requestedThinkingLevel = toPiThinkingLevel(opts.modelReasoningEffort)
    const { session: piAgentSession } = await piSdk.createAgentSession({
        cwd: workingDirectory,
        agentDir,
        authStorage,
        modelRegistry,
        settingsManager,
        sessionManager,
        scopedModels: scopedModelContext.scopeEnabled ? scopedModelContext.scopedPiModels : undefined,
        model: requestedModel,
        thinkingLevel: requestedThinkingLevel
    })

    if (!piAgentSession.model) {
        throw new Error('Pi did not resolve an authenticated model. Configure Pi first.')
    }

    const defaultModel = piAgentSession.model
    const defaultThinkingLevel = piAgentSession.thinkingLevel as PiThinkingLevel
    let selectedRuntimeState = getRuntimeStateFromPiSession(opts.permissionMode ?? 'default', piAgentSession)
    let activeRuntimeHash = createModeHash(selectedRuntimeState)
    let currentAssistantStreamId: string | null = null
    let abortRequested = false

    const permissionHandler = new PiPermissionHandler(
        session,
        () => piSession.getPermissionMode() as PiPermissionMode | undefined,
        async () => {
            abortRequested = true
            await piAgentSession.abort()
        }
    )

    bindPermissionGate(piAgentSession, permissionHandler)
    const applyRuntimeState = (
        runtimeState: PiRuntimeState,
        options?: { persistSelection?: boolean }
    ): void => {
        applyModel(piAgentSession, resolvePiModel(effectiveSelectablePiModels, runtimeState.model ?? undefined) ?? defaultModel)
        applyThinkingLevel(
            piAgentSession,
            toPiThinkingLevel(runtimeState.modelReasoningEffort) ?? defaultThinkingLevel
        )

        const nextRuntimeState: PiRuntimeState = {
            permissionMode: runtimeState.permissionMode,
            model: formatPiModel(piAgentSession.model),
            modelReasoningEffort: fromPiThinkingLevel(piAgentSession.thinkingLevel)
        }
        activeRuntimeHash = createModeHash(nextRuntimeState)
        if (options?.persistSelection) {
            selectedRuntimeState = nextRuntimeState
        }
        syncRuntimeSnapshot(piSession, nextRuntimeState)
    }

    const restoreSelectedRuntimeState = (): void => {
        if (activeRuntimeHash === createModeHash(selectedRuntimeState)) {
            return
        }
        applyRuntimeState(selectedRuntimeState)
    }

    applyRuntimeState(selectedRuntimeState, { persistSelection: true })

    session.onUserMessage((message) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments)
        messageQueue.push(formattedText, selectedRuntimeState)
    })

    session.rpcHandlerManager.registerHandler('abort', async () => {
        abortRequested = true
        await piAgentSession.abort()
        await permissionHandler.cancelAll('User aborted')
    })

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as {
            permissionMode?: unknown
            model?: unknown
            modelReasoningEffort?: unknown
        }

        const nextRuntimeState: PiRuntimeState = { ...selectedRuntimeState }

        if (config.permissionMode !== undefined) {
            nextRuntimeState.permissionMode = resolvePermissionModeForDriver(config.permissionMode, 'pi') as PiPermissionMode
        }

        if (config.model !== undefined) {
            if (config.model === null) {
                nextRuntimeState.model = formatPiModel(defaultModel)
            } else if (typeof config.model === 'string') {
                nextRuntimeState.model = formatPiModel(resolvePiModel(effectiveSelectablePiModels, config.model)) ?? formatPiModel(defaultModel)
            } else {
                throw new Error('Invalid Pi model')
            }
        }

        if (config.modelReasoningEffort !== undefined) {
            if (config.modelReasoningEffort === null) {
                nextRuntimeState.modelReasoningEffort = fromPiThinkingLevel(defaultThinkingLevel)
            } else {
                const nextThinkingLevel = toPiThinkingLevel(config.modelReasoningEffort as SessionModelReasoningEffort)
                if (!nextThinkingLevel) {
                    throw new Error('Invalid Pi model reasoning effort')
                }
                nextRuntimeState.modelReasoningEffort = fromPiThinkingLevel(nextThinkingLevel)
            }
        }

        applyRuntimeState(nextRuntimeState, { persistSelection: true })

        return {
            applied: {
                permissionMode: selectedRuntimeState.permissionMode,
                model: selectedRuntimeState.model,
                modelReasoningEffort: selectedRuntimeState.modelReasoningEffort
            }
        }
    })

    const unsubscribe = piAgentSession.subscribe((event: PiSdkSessionEvent) => {
        switch (event.type) {
            case 'agent_start':
                piSession.onThinkingChange(true)
                return
            case 'agent_end':
                piSession.onThinkingChange(false)
                return
            case 'message_start':
                if (isAssistantMessage(event.message)) {
                    currentAssistantStreamId = getPiAssistantStreamId(event.message)
                }
                return
            case 'message_update':
                if (
                    currentAssistantStreamId
                    && event.assistantMessageEvent.type === 'text_delta'
                    && event.assistantMessageEvent.delta
                ) {
                    piSession.sendStreamUpdate({
                        kind: 'append',
                        streamId: currentAssistantStreamId,
                        delta: event.assistantMessageEvent.delta
                    })
                }
                return
            case 'message_end':
                if (isAssistantMessage(event.message)) {
                    const streamId = currentAssistantStreamId ?? getPiAssistantStreamId(event.message)
                    piSession.sendOutputMessage(buildPiAssistantOutputRecord(event.message))
                    piSession.sendStreamUpdate({
                        kind: 'clear',
                        streamId
                    })
                    currentAssistantStreamId = null
                    return
                }

                if (isToolResultMessage(event.message)) {
                    piSession.sendOutputMessage(buildPiToolResultOutputRecord(event.message))
                }
                return
            default:
                return
        }
    })

    try {
        piSession.sendSessionEvent({ type: 'ready' })

        while (true) {
            const batch = await messageQueue.waitForMessagesAndGetAsString()
            if (!batch) {
                break
            }

            applyRuntimeState(batch.mode)
            piSession.onThinkingChange(true)

            try {
                await piAgentSession.prompt(batch.message)
            } catch (error) {
                if (abortRequested) {
                    logger.debug('[pi] Prompt aborted')
                } else {
                    logger.debug('[pi] Prompt failed', error)
                    piSession.sendSessionEvent({
                        type: 'message',
                        message: error instanceof Error ? error.message : String(error)
                    })
                }
            } finally {
                abortRequested = false
                piSession.onThinkingChange(false)
                await permissionHandler.cancelAll('Prompt finished')
                if (messageQueue.size() === 0) {
                    restoreSelectedRuntimeState()
                }
                await emitReadyIfIdle({
                    hasPending: () => permissionHandler.hasPendingRequests(),
                    queueSize: () => messageQueue.size(),
                    shouldExit: () => false,
                    flushBeforeReady: () => flushReadyStateBeforeReady(session),
                    sendReady: () => piSession.sendSessionEvent({ type: 'ready' })
                })
            }
        }
    } catch (error) {
        lifecycle.markCrash(error)
        throw error
    } finally {
        unsubscribe()
        await permissionHandler.cancelAll('Session ended')
        try {
            await piAgentSession.abort()
        } catch {
        }
        piAgentSession.dispose()
        await lifecycle.cleanupAndExit()
    }
}
