import { AssistantStreamBridge } from '@/agent/assistantStreamBridge'
import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { assertSessionConfigPayload, resolvePermissionModeForDriver } from '@/agent/providerConfig'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { settleTerminalTurn, surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import type { PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'
import type { ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import type { MessageQueue2 } from '@/utils/MessageQueue2'
import { formatPiModel, resolvePiModel } from './launchConfig'
import {
    buildPiAssistantOutputRecord,
    buildPiToolResultOutputRecord,
    getPiAssistantTurnId,
    type PiAssistantMessage,
    type PiThinkingLevel,
    type PiToolResultMessage,
    toPiThinkingLevel,
} from './messageCodec'
import type { PiRpcClient, PiRpcModel } from './piRpcClient'
import {
    createModeHash,
    getRuntimeStateFromPiState,
    type PiRuntimeState,
    recoverPiMessages,
    syncRuntimeSnapshot,
} from './runPiRuntimeState'
import type { PiSession } from './session'
import type { PiMode } from './types'

export type { PiRuntimeState } from './runPiRuntimeState'
export { createModeHash, getRuntimeStateFromPiState, recoverPiMessages, syncRuntimeSnapshot }

type SetSessionConfigPayload = {
    permissionMode?: unknown
    model?: unknown
    modelReasoningEffort?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isAssistantMessage(message: unknown): message is PiAssistantMessage {
    return isRecord(message) && message.role === 'assistant'
}

function isToolResultMessage(message: unknown): message is PiToolResultMessage {
    return isRecord(message) && message.role === 'toolResult'
}

function resolvePiConfigModel(options: {
    defaultModel: PiRpcModel | null | undefined
    selectableModels: readonly PiRpcModel[]
    model: unknown
}): SessionModel {
    if (options.model === null) {
        return formatPiModel(options.defaultModel)
    }
    if (typeof options.model !== 'string') {
        throw new Error('Invalid Pi model')
    }
    return formatPiModel(resolvePiModel(options.selectableModels, options.model)) ?? formatPiModel(options.defaultModel)
}

function resolvePiConfigReasoningEffort(value: unknown): SessionModelReasoningEffort {
    if (value === null) {
        return null
    }
    if (typeof value !== 'string') {
        throw new Error('Invalid Pi model reasoning effort')
    }
    const thinkingLevel = toPiThinkingLevel(value as SessionModelReasoningEffort)
    if (!thinkingLevel) {
        throw new Error('Invalid Pi model reasoning effort')
    }
    return thinkingLevel === 'off' ? 'none' : thinkingLevel
}

export function registerPiSessionConfigHandler(options: {
    session: ApiSessionClient
    rpcClient: PiRpcClient
    selectableModels: readonly PiRpcModel[]
    defaultModel: PiRpcModel | null | undefined
    getSelectedRuntimeState: () => PiRuntimeState
    applyRuntimeState: (runtimeState: PiRuntimeState, options?: { persistSelection?: boolean }) => Promise<void>
}): void {
    options.session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as SetSessionConfigPayload
        const nextRuntimeState: PiRuntimeState = { ...options.getSelectedRuntimeState() }
        if (config.permissionMode !== undefined) {
            nextRuntimeState.permissionMode = resolvePermissionModeForDriver(
                config.permissionMode,
                'pi'
            ) as PiPermissionMode
        }
        if (config.model !== undefined) {
            nextRuntimeState.model = resolvePiConfigModel({
                defaultModel: options.defaultModel,
                selectableModels: options.selectableModels,
                model: config.model,
            })
        }
        if (config.modelReasoningEffort !== undefined) {
            nextRuntimeState.modelReasoningEffort = resolvePiConfigReasoningEffort(config.modelReasoningEffort)
        }
        await options.applyRuntimeState(nextRuntimeState, { persistSelection: true })
        return { applied: options.getSelectedRuntimeState() }
    })
}

export function subscribeToPiSessionEvents(options: { piSession: PiSession; rpcClient: PiRpcClient }): () => void {
    const assistantStream = new AssistantStreamBridge({
        append: ({ assistantTurnId, delta }) =>
            options.piSession.sendStreamUpdate({ kind: 'append', assistantTurnId, delta }),
        clear: ({ assistantTurnId }) =>
            options.piSession.sendStreamUpdate(
                assistantTurnId ? { kind: 'clear', assistantTurnId } : { kind: 'clear' }
            ),
    })
    return options.rpcClient.onEvent((event) => {
        switch (event.type) {
            case 'agent_start':
                options.piSession.onThinkingChange(true)
                return
            case 'agent_end':
                assistantStream.clearDanglingAssistantTurn()
                options.piSession.onThinkingChange(false)
                return
            case 'message_start':
                if (isAssistantMessage(event.message)) {
                    assistantStream.beginAssistantTurn(getPiAssistantTurnId(event.message))
                }
                return
            case 'message_update': {
                const update = event.assistantMessageEvent
                if (isRecord(update) && update.type === 'text_delta' && typeof update.delta === 'string') {
                    assistantStream.appendTextDelta(update.delta)
                }
                return
            }
            case 'message_end':
                if (isAssistantMessage(event.message)) {
                    const assistantTurnId = getPiAssistantTurnId(event.message)
                    options.piSession.sendOutputMessage(buildPiAssistantOutputRecord(event.message), {
                        assistantTurnId,
                    })
                    assistantStream.acknowledgeDurableTurn(assistantTurnId)
                    return
                }
                if (isToolResultMessage(event.message)) {
                    options.piSession.sendOutputMessage(buildPiToolResultOutputRecord(event.message))
                }
                return
            default:
                return
        }
    })
}

export async function runPiPromptLoop(options: {
    session: ApiSessionClient
    piSession: PiSession
    messageQueue: MessageQueue2<PiMode>
    rpcClient: PiRpcClient
    applyRuntimeState: (runtimeState: PiRuntimeState, options?: { persistSelection?: boolean }) => Promise<void>
    restoreSelectedRuntimeState: () => Promise<void>
    getAbortRequested: () => boolean
    resetAbortRequested: () => void
}): Promise<void> {
    options.piSession.sendSessionEvent({ type: 'ready' })
    const readyScheduler = createReadyEventScheduler({
        label: '[pi]',
        hasPending: () => false,
        queueSize: () => options.messageQueue.size(),
        shouldExit: () => false,
        flushBeforeReady: () => flushReadyStateBeforeReady(options.session),
        sendReady: () => options.piSession.sendSessionEvent({ type: 'ready' }),
    })
    while (true) {
        const batch = await options.messageQueue.waitForMessagesAndGetAsString()
        if (!batch) break

        await options.applyRuntimeState(batch.mode)
        options.piSession.onThinkingChange(true)
        try {
            await options.rpcClient.prompt(batch.message)
        } catch (error) {
            if (options.getAbortRequested()) {
                logger.debug('[pi] Prompt aborted')
            } else {
                logger.debug('[pi] Prompt failed', error)
                surfaceTerminalFailure({
                    error,
                    fallbackMessage: 'Pi prompt failed. Check logs for details.',
                    detailPrefix: 'Pi prompt failed',
                    sendSessionMessage: (message) => options.piSession.sendSessionEvent({ type: 'message', message }),
                })
            }
        } finally {
            options.resetAbortRequested()
            await settleTerminalTurn({
                setThinking: (thinking) => options.piSession.onThinkingChange(thinking),
                afterThinkingCleared: async () => {
                    if (options.messageQueue.size() === 0) {
                        await options.restoreSelectedRuntimeState()
                    }
                },
                emitReady: async () => await readyScheduler.emitNow(),
            })
        }
    }
    readyScheduler.dispose()
}
