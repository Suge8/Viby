import { AssistantStreamBridge } from '@/agent/assistantStreamBridge'
import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { assertSessionConfigPayload, resolvePermissionModeForDriver } from '@/agent/providerConfig'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { settleTerminalTurn, surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import type { PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'
import type { ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import type { MessageQueue2 } from '@/utils/MessageQueue2'
import { resolvePiModel } from './launchConfig'
import {
    buildPiAssistantOutputRecord,
    buildPiToolResultOutputRecord,
    formatPiModel,
    fromPiThinkingLevel,
    getPiAssistantTurnId,
    type PiAssistantMessage,
    type PiMessage,
    type PiThinkingLevel,
    type PiToolResultMessage,
    toPiThinkingLevel,
} from './messageCodec'
import { PiPermissionHandler } from './permissionHandler'
import {
    applyModel,
    applyThinkingLevel,
    createModeHash,
    getRuntimeStateFromPiSession,
    type PiRuntimeState,
    preloadRecoveredMessages,
    recoverPiMessages,
    syncRuntimeSnapshot,
} from './runPiRuntimeState'

export type { PiRuntimeState } from './runPiRuntimeState'
export {
    applyModel,
    applyThinkingLevel,
    createModeHash,
    getRuntimeStateFromPiSession,
    preloadRecoveredMessages,
    recoverPiMessages,
    syncRuntimeSnapshot,
}

import {
    isConfiguredPiReasoningEffort,
    type PiBeforeToolCallContext,
    type PiBeforeToolCallHook,
    type PiBeforeToolCallResult,
    type PiSdkModel,
    type PiSdkSession,
    type PiSdkSessionEvent,
    type PiSdkSessionManager,
} from './runPiSupportTypes'
import type { PiSession } from './session'
import type { PiMode } from './types'

type SetSessionConfigPayload = {
    permissionMode?: unknown
    model?: unknown
    modelReasoningEffort?: unknown
}

function resolvePiConfigModel(options: {
    defaultModel: PiSdkModel
    effectiveSelectablePiModels: Parameters<typeof resolvePiModel>[0]
    model: unknown
}): SessionModel {
    if (options.model === null) {
        return formatPiModel(options.defaultModel)
    }
    if (typeof options.model !== 'string') {
        throw new Error('Invalid Pi model')
    }

    return (
        formatPiModel(resolvePiModel(options.effectiveSelectablePiModels, options.model)) ??
        formatPiModel(options.defaultModel)
    )
}

function resolvePiConfigReasoningEffort(options: {
    defaultThinkingLevel: PiThinkingLevel
    modelReasoningEffort: unknown
}): SessionModelReasoningEffort {
    if (options.modelReasoningEffort === null) {
        return fromPiThinkingLevel(options.defaultThinkingLevel)
    }
    if (!isConfiguredPiReasoningEffort(options.modelReasoningEffort)) {
        throw new Error('Invalid Pi model reasoning effort')
    }

    const nextThinkingLevel = toPiThinkingLevel(options.modelReasoningEffort)
    if (!nextThinkingLevel) {
        throw new Error('Invalid Pi model reasoning effort')
    }

    return fromPiThinkingLevel(nextThinkingLevel)
}

export function bindPermissionGate(piSession: PiSdkSession, permissionHandler: PiPermissionHandler): void {
    const previousBeforeToolCall = (piSession.agent as unknown as { _beforeToolCall?: PiBeforeToolCallHook })
        ._beforeToolCall
    piSession.agent.setBeforeToolCall(
        async (context: PiBeforeToolCallContext, signal?: AbortSignal): Promise<PiBeforeToolCallResult> => {
            const vibyDecision = await permissionHandler.handleToolCall(
                context.toolCall.id,
                context.toolCall.name,
                context.args
            )
            if (vibyDecision?.block) {
                return vibyDecision
            }
            return previousBeforeToolCall ? await previousBeforeToolCall(context, signal) : undefined
        }
    )
}

function isAssistantMessage(message: unknown): message is PiAssistantMessage {
    return typeof message === 'object' && message !== null && 'role' in message && message.role === 'assistant'
}

function isToolResultMessage(message: unknown): message is PiToolResultMessage {
    return typeof message === 'object' && message !== null && 'role' in message && message.role === 'toolResult'
}

export function registerPiSessionConfigHandler(options: {
    session: ApiSessionClient
    effectiveSelectablePiModels: Parameters<typeof resolvePiModel>[0]
    defaultModel: PiSdkModel
    defaultThinkingLevel: PiThinkingLevel
    getSelectedRuntimeState: () => PiRuntimeState
    applyRuntimeState: (runtimeState: PiRuntimeState, options?: { persistSelection?: boolean }) => void
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
                effectiveSelectablePiModels: options.effectiveSelectablePiModels,
                model: config.model,
            })
        }
        if (config.modelReasoningEffort !== undefined) {
            nextRuntimeState.modelReasoningEffort = resolvePiConfigReasoningEffort({
                defaultThinkingLevel: options.defaultThinkingLevel,
                modelReasoningEffort: config.modelReasoningEffort,
            })
        }

        options.applyRuntimeState(nextRuntimeState, { persistSelection: true })
        const selectedRuntimeState = options.getSelectedRuntimeState()
        return {
            applied: {
                permissionMode: selectedRuntimeState.permissionMode,
                model: selectedRuntimeState.model,
                modelReasoningEffort: selectedRuntimeState.modelReasoningEffort,
            },
        }
    })
}

export function subscribeToPiSessionEvents(options: { piSession: PiSession; sdkSession: PiSdkSession }): () => void {
    const assistantStream = new AssistantStreamBridge({
        append: ({ assistantTurnId, delta }) =>
            options.piSession.sendStreamUpdate({
                kind: 'append',
                assistantTurnId,
                delta,
            }),
        clear: ({ assistantTurnId }) =>
            options.piSession.sendStreamUpdate(
                assistantTurnId ? { kind: 'clear', assistantTurnId } : { kind: 'clear' }
            ),
    })
    return options.sdkSession.subscribe((event: PiSdkSessionEvent) => {
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
            case 'message_update':
                if (event.assistantMessageEvent.type === 'text_delta' && event.assistantMessageEvent.delta) {
                    assistantStream.appendTextDelta(event.assistantMessageEvent.delta)
                }
                return
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
    sdkSession: PiSdkSession
    permissionHandler: PiPermissionHandler
    applyRuntimeState: (runtimeState: PiRuntimeState, options?: { persistSelection?: boolean }) => void
    restoreSelectedRuntimeState: () => void
    getAbortRequested: () => boolean
    resetAbortRequested: () => void
}): Promise<void> {
    options.piSession.sendSessionEvent({ type: 'ready' })
    const readyScheduler = createReadyEventScheduler({
        label: '[pi]',
        hasPending: () => options.permissionHandler.hasPendingRequests(),
        queueSize: () => options.messageQueue.size(),
        shouldExit: () => false,
        flushBeforeReady: () => flushReadyStateBeforeReady(options.session),
        sendReady: () => options.piSession.sendSessionEvent({ type: 'ready' }),
    })
    while (true) {
        const batch = await options.messageQueue.waitForMessagesAndGetAsString()
        if (!batch) {
            break
        }

        options.applyRuntimeState(batch.mode)
        options.piSession.onThinkingChange(true)
        try {
            await options.sdkSession.prompt(batch.message)
        } catch (error) {
            if (options.getAbortRequested()) {
                logger.debug('[pi] Prompt aborted')
            } else {
                logger.debug('[pi] Prompt failed', error)
                surfaceTerminalFailure({
                    error,
                    fallbackMessage: 'Pi prompt failed. Check logs for details.',
                    detailPrefix: 'Pi prompt failed',
                    sendSessionMessage: (message) =>
                        options.piSession.sendSessionEvent({
                            type: 'message',
                            message,
                        }),
                })
            }
        } finally {
            options.resetAbortRequested()
            await settleTerminalTurn({
                setThinking: (thinking) => options.piSession.onThinkingChange(thinking),
                afterThinkingCleared: async () => {
                    await options.permissionHandler.cancelAll('Prompt finished')
                    if (options.messageQueue.size() === 0) {
                        options.restoreSelectedRuntimeState()
                    }
                },
                emitReady: async () => await readyScheduler.emitNow(),
            })
        }
    }

    readyScheduler.dispose()
}
