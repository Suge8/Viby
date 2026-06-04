import { join } from 'node:path'
import { createRuntimeLifecycle, setControlledByUser } from '@/agent/runtimeLifecycle'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { bootstrapSession } from '@/agent/sessionFactory'
import type { AgentState, PiPermissionMode, SessionModelReasoningEffort } from '@/api/types'
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler'
import { logger } from '@/ui/logger'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import {
    buildPiModelFromSelection,
    formatPiModel,
    normalizePiModelSelection,
    resolvePiRuntimeModel,
    toPiModelCapabilities,
} from './launchConfig'
import { PiRpcClient, type PiRpcModel, type PiRpcState, resolvePiExecutable } from './piRpcClient'
import {
    createModeHash,
    getRuntimeStateFromPiState,
    type PiRuntimeState,
    recoverPiMessages,
    registerPiSessionConfigHandler,
    runPiPromptLoop,
    subscribeToPiSessionEvents,
    syncRuntimeSnapshot,
} from './runPiSupport'
import { PiSession } from './session'
import type { PiMode } from './types'

function buildStartupModelFallbacks(state: PiRpcState, requestedModel: string | undefined): PiRpcModel[] {
    const models = [state.model, buildPiModelFromSelection(requestedModel)].filter((model): model is PiRpcModel =>
        Boolean(model)
    )
    const seen = new Set<string>()
    return models.filter((model) => {
        const key = formatPiModel(model) ?? model.id
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

async function loadStartupPiModels(options: {
    rpcClient: PiRpcClient
    state: PiRpcState
    requestedModel: string | undefined
}): Promise<PiRpcModel[]> {
    try {
        return await options.rpcClient.getAvailableModels()
    } catch (error) {
        logger.debug('[pi] Model catalog unavailable during startup; continuing with current model', error)
        return buildStartupModelFallbacks(options.state, options.requestedModel)
    }
}

export async function runPi(
    opts: {
        startedBy?: 'app-core' | 'terminal'
        vibySessionId?: string
        driverSwitchBootstrap?: boolean
        permissionMode?: PiPermissionMode
        model?: string
        modelReasoningEffort?: SessionModelReasoningEffort
        resumeSessionId?: string
    } = {}
): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'
    logger.debug(`[pi] Starting external RPC runtime: startedBy=${startedBy}`)

    const piCommand = resolvePiExecutable()
    const rpcClient = new PiRpcClient({
        cwd: workingDirectory,
        command: piCommand,
        model: opts.model,
        resumeSessionId: opts.resumeSessionId,
    })
    await rpcClient.start()
    const state = await rpcClient.getState()
    const selectableModels = await loadStartupPiModels({ rpcClient, state, requestedModel: opts.model })
    const defaultModel = state.model ?? resolvePiRuntimeModel(selectableModels, opts.model, null)
    const piModelCapabilities = toPiModelCapabilities(selectableModels)

    const initialRuntimeState = getRuntimeStateFromPiState(opts.permissionMode ?? 'default', state)
    const selectedStartupRuntimeState: PiRuntimeState = {
        ...initialRuntimeState,
        ...(opts.model ? { model: normalizePiModelSelection(opts.model) ?? initialRuntimeState.model } : {}),
        ...(opts.modelReasoningEffort !== undefined ? { modelReasoningEffort: opts.modelReasoningEffort } : {}),
    }
    const initialState: AgentState = { controlledByUser: false }
    const { api, session } = await bootstrapSession({
        driver: 'pi',
        sessionId: opts.vibySessionId,
        startedBy,
        driverSwitchBootstrap: opts.driverSwitchBootstrap,
        workingDirectory,
        agentState: initialState,
        permissionMode: selectedStartupRuntimeState.permissionMode,
        model: selectedStartupRuntimeState.model ?? formatPiModel(defaultModel) ?? undefined,
        modelReasoningEffort: selectedStartupRuntimeState.modelReasoningEffort,
        metadataOverrides: { piModelScope: { models: piModelCapabilities } },
    })
    setControlledByUser(session, false)

    const messageQueue = new MessageQueue2<PiMode>(createModeHash)
    const piSession = new PiSession({
        api,
        client: session,
        path: workingDirectory,
        logPath: join(workingDirectory, '.pi', 'viby-pi.log'),
        sessionId: state.sessionId ?? null,
        messageQueue,
        startedBy,
    })
    reportDiscoveredSessionId(piSession.onSessionFound, state.sessionId)
    let abortRequested = false

    async function requestPiShutdown(): Promise<void> {
        messageQueue.close()
        abortRequested = true
        await rpcClient.abort().catch(() => undefined)
    }

    const lifecycle = createRuntimeLifecycle({
        session,
        logTag: 'pi',
        requestShutdown: requestPiShutdown,
        stopKeepAlive: () => {
            messageQueue.close()
            piSession.stopKeepAlive()
        },
    })
    lifecycle.registerProcessHandlers()
    piSession.setRuntimeStopHandler(requestPiShutdown)
    registerKillSessionHandler(session.rpcHandlerManager, requestPiShutdown)

    await recoverPiMessages(api, opts.vibySessionId)
    let selectedRuntimeState: PiRuntimeState = selectedStartupRuntimeState
    let activeRuntimeHash = createModeHash(initialRuntimeState)

    const applyRuntimeState = async (
        runtimeState: PiRuntimeState,
        options?: { persistSelection?: boolean }
    ): Promise<void> => {
        const nextModel = resolvePiRuntimeModel(selectableModels, runtimeState.model, defaultModel)
        if (nextModel) {
            await rpcClient.setModel(nextModel)
        }
        if (runtimeState.modelReasoningEffort && runtimeState.modelReasoningEffort !== 'max') {
            await rpcClient.setThinkingLevel(
                runtimeState.modelReasoningEffort === 'none' ? 'off' : runtimeState.modelReasoningEffort
            )
        }
        const nextState = await rpcClient.getState()
        const nextRuntimeState = getRuntimeStateFromPiState(runtimeState.permissionMode, nextState)
        activeRuntimeHash = createModeHash(nextRuntimeState)
        if (options?.persistSelection) {
            selectedRuntimeState = nextRuntimeState
        }
        syncRuntimeSnapshot(piSession, nextRuntimeState)
    }

    const restoreSelectedRuntimeState = async (): Promise<void> => {
        if (activeRuntimeHash !== createModeHash(selectedRuntimeState)) {
            await applyRuntimeState(selectedRuntimeState)
        }
    }

    await applyRuntimeState(selectedRuntimeState, { persistSelection: true })
    session.onUserMessage((message, localId) => {
        messageQueue.push(
            formatMessageWithAttachments(message.content.text, message.content.attachments),
            selectedRuntimeState,
            localId
        )
    })
    session.rpcHandlerManager.registerHandler('abort', async () => {
        abortRequested = true
        await rpcClient.abort()
    })
    registerPiSessionConfigHandler({
        session,
        rpcClient,
        selectableModels,
        defaultModel,
        getSelectedRuntimeState: () => selectedRuntimeState,
        applyRuntimeState,
    })
    const unsubscribe = subscribeToPiSessionEvents({ piSession, rpcClient })

    try {
        await runPiPromptLoop({
            session,
            piSession,
            messageQueue,
            rpcClient,
            applyRuntimeState,
            restoreSelectedRuntimeState,
            getAbortRequested: () => abortRequested,
            resetAbortRequested: () => {
                abortRequested = false
            },
        })
    } catch (error) {
        lifecycle.markCrash(error)
        throw error
    } finally {
        unsubscribe()
        await rpcClient.stop()
        await lifecycle.cleanupAndExit()
    }
}
