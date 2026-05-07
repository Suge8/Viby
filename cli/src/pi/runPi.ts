import { join } from 'node:path'
import { createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { bootstrapSession } from '@/agent/sessionFactory'
import type { AgentState, PiPermissionMode, SessionModelReasoningEffort } from '@/api/types'
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler'
import { logger } from '@/ui/logger'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { formatPiModel, normalizePiModelSelection, resolvePiModel, toPiModelCapabilities } from './launchConfig'
import { PiRpcClient, resolvePiExecutable } from './piRpcClient'
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

export async function runPi(
    opts: {
        startedBy?: 'runner' | 'terminal'
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
    const selectableModels = await rpcClient.getAvailableModels()
    const state = await rpcClient.getState()
    const defaultModel = state.model ?? resolvePiModel(selectableModels, opts.model)
    const piModelCapabilities = toPiModelCapabilities(selectableModels)

    const initialState: AgentState = { controlledByUser: false }
    const { api, session } = await bootstrapSession({
        driver: 'pi',
        sessionId: opts.vibySessionId,
        startedBy,
        driverSwitchBootstrap: opts.driverSwitchBootstrap,
        workingDirectory,
        agentState: initialState,
        permissionMode: opts.permissionMode ?? 'default',
        model: normalizePiModelSelection(opts.model) ?? formatPiModel(defaultModel) ?? undefined,
        modelReasoningEffort: opts.modelReasoningEffort,
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

    const lifecycle = createRunnerLifecycle({
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
    let selectedRuntimeState = getRuntimeStateFromPiState(opts.permissionMode ?? 'default', state)
    let activeRuntimeHash = createModeHash(selectedRuntimeState)

    const applyRuntimeState = async (
        runtimeState: PiRuntimeState,
        options?: { persistSelection?: boolean }
    ): Promise<void> => {
        const nextModel = resolvePiModel(selectableModels, runtimeState.model ?? undefined) ?? defaultModel
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
