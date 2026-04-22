import { join } from 'node:path'
import { createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle'
import { bootstrapSession } from '@/agent/sessionFactory'
import type { AgentState, PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler'
import { logger } from '@/ui/logger'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { normalizePiModelSelection, resolvePiModel, resolvePiScopedModelContext } from './launchConfig'
import { formatPiModel, fromPiThinkingLevel, type PiThinkingLevel, toPiThinkingLevel } from './messageCodec'
import { PiPermissionHandler } from './permissionHandler'
import {
    applyModel,
    applyThinkingLevel,
    bindPermissionGate,
    createModeHash,
    getRuntimeStateFromPiSession,
    type PiRuntimeState,
    preloadRecoveredMessages,
    recoverPiMessages,
    registerPiSessionConfigHandler,
    runPiPromptLoop,
    subscribeToPiSessionEvents,
    syncRuntimeSnapshot,
} from './runPiSupport'
import { PiSession } from './session'
import type { PiMode } from './types'

type PiSdkModule = typeof import('@mariozechner/pi-coding-agent')
type PiSdkSession = Awaited<ReturnType<PiSdkModule['createAgentSession']>>['session']
type PiSdkModel = NonNullable<PiSdkSession['model']>
type PiSdkSettingsManager = ReturnType<PiSdkModule['SettingsManager']['create']>

export async function runPi(
    opts: {
        startedBy?: 'runner' | 'terminal'
        vibySessionId?: string
        driverSwitchBootstrap?: boolean
        permissionMode?: PiPermissionMode
        model?: string
        modelReasoningEffort?: SessionModelReasoningEffort
    } = {}
): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'

    logger.debug(`[pi] Starting with options: startedBy=${startedBy}`)

    const piSdk = (await import('@mariozechner/pi-coding-agent')) as PiSdkModule
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
        controlledByUser: false,
    }

    const { api, session } = await bootstrapSession({
        driver: 'pi',
        sessionId: opts.vibySessionId,
        startedBy,
        driverSwitchBootstrap: opts.driverSwitchBootstrap,
        workingDirectory,
        agentState: initialState,
        permissionMode: opts.permissionMode ?? 'default',
        model: normalizePiModelSelection(opts.model),
        modelReasoningEffort: opts.modelReasoningEffort,
        metadataOverrides: {
            piModelScope: {
                models: piModelCapabilities,
            },
        },
    })

    setControlledByUser(session, false)

    const messageQueue = new MessageQueue2<PiMode>(createModeHash)
    const piSession = new PiSession({
        api,
        client: session,
        path: workingDirectory,
        logPath: join(workingDirectory, '.pi', 'viby-pi.log'),
        sessionId: null,
        messageQueue,
        startedBy,
    })
    let abortRequested = false
    let piAgentSession: PiSdkSession | null = null

    async function requestPiShutdown(): Promise<void> {
        messageQueue.close()
        abortRequested = true
        if (!piAgentSession) {
            return
        }
        try {
            await piAgentSession.abort()
        } catch {}
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
    registerKillSessionHandler(session.rpcHandlerManager, requestPiShutdown)

    const recoveredMessages = await recoverPiMessages(api, opts.vibySessionId)
    const sessionManager = piSdk.SessionManager.inMemory(workingDirectory)
    preloadRecoveredMessages(sessionManager, recoveredMessages)

    const resourceLoader = new piSdk.DefaultResourceLoader({})
    await resourceLoader.reload()

    const requestedModel = resolvePiModel(effectiveSelectablePiModels, opts.model)
    const requestedThinkingLevel = toPiThinkingLevel(opts.modelReasoningEffort)
    const { session: createdPiAgentSession } = await piSdk.createAgentSession({
        cwd: workingDirectory,
        agentDir,
        authStorage,
        modelRegistry,
        settingsManager,
        sessionManager,
        resourceLoader,
        scopedModels: scopedModelContext.scopeEnabled ? scopedModelContext.scopedPiModels : undefined,
        model: requestedModel,
        thinkingLevel: requestedThinkingLevel,
    })
    piAgentSession = createdPiAgentSession

    if (!piAgentSession.model) {
        throw new Error('Pi did not resolve an authenticated model. Configure Pi first.')
    }

    if (abortRequested) {
        await requestPiShutdown()
    }

    const defaultModel = piAgentSession.model
    const defaultThinkingLevel = piAgentSession.thinkingLevel as PiThinkingLevel
    let selectedRuntimeState = getRuntimeStateFromPiSession(opts.permissionMode ?? 'default', piAgentSession)
    let activeRuntimeHash = createModeHash(selectedRuntimeState)
    let currentAssistantStreamId: string | null = null

    const permissionHandler = new PiPermissionHandler(
        session,
        () => piSession.getPermissionMode() as PiPermissionMode | undefined,
        async () => {
            abortRequested = true
            await piAgentSession.abort()
        }
    )

    bindPermissionGate(piAgentSession, permissionHandler)
    const applyRuntimeState = (runtimeState: PiRuntimeState, options?: { persistSelection?: boolean }): void => {
        applyModel(
            piAgentSession,
            resolvePiModel(effectiveSelectablePiModels, runtimeState.model ?? undefined) ?? defaultModel
        )
        applyThinkingLevel(piAgentSession, toPiThinkingLevel(runtimeState.modelReasoningEffort) ?? defaultThinkingLevel)

        const nextRuntimeState: PiRuntimeState = {
            permissionMode: runtimeState.permissionMode,
            model: formatPiModel(piAgentSession.model),
            modelReasoningEffort: fromPiThinkingLevel(piAgentSession.thinkingLevel),
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

    registerPiSessionConfigHandler({
        session,
        effectiveSelectablePiModels,
        defaultModel,
        defaultThinkingLevel,
        getSelectedRuntimeState: () => selectedRuntimeState,
        applyRuntimeState,
    })

    const unsubscribe = subscribeToPiSessionEvents({
        piSession,
        sdkSession: piAgentSession,
    })

    try {
        await runPiPromptLoop({
            session,
            piSession,
            messageQueue,
            sdkSession: piAgentSession,
            permissionHandler,
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
        await permissionHandler.cancelAll('Session ended')
        try {
            await piAgentSession.abort()
        } catch {}
        piAgentSession.dispose()
        await lifecycle.cleanupAndExit()
    }
}
