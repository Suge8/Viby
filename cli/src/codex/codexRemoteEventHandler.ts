import type { MessageBuffer } from '@/ui/ink/messageBuffer'
import { logger } from '@/ui/logger'
import { dispatchBufferEvent, dispatchCodexStructuredEvent } from './codexRemoteEventDispatch'
import {
    asRecord,
    asString,
    type CodexRemoteRuntimeState,
    hasExplicitTurnContext,
    normalizeCommand,
    rememberSuppressedTurn,
    shouldIgnoreTurnContentEvent,
    TERMINAL_EVENT_TYPES,
    TURN_CONTENT_EVENT_TYPES,
} from './codexRemoteSupport'
import type { CodexSession } from './session'
import type { AppServerEventConverter } from './utils/appServerEventConverter'
import type { DiffProcessor } from './utils/diffProcessor'
import type { ReasoningProcessor } from './utils/reasoningProcessor'
import { shouldIgnoreTerminalEvent } from './utils/terminalEventGuard'

export function createCodexEventHandler(options: {
    session: CodexSession
    state: CodexRemoteRuntimeState
    messageBuffer: MessageBuffer
    reasoningProcessor: ReasoningProcessor
    diffProcessor: DiffProcessor
    appServerEventConverter: AppServerEventConverter
    bindThreadId: (threadId: string) => void
    clearAssistantStream: () => void
    appendAssistantStream: (assistantTurnId: string, delta: string) => void
    acknowledgeAssistantTurn: (assistantTurnId: string) => void
    notifyTurnSettled: () => void
    scheduleReadyAfterTurn: () => void
    clearReadyAfterTurnTimer: () => void
    hasReadyAfterTurnTimer: () => boolean
}): (msg: Record<string, unknown>) => void {
    const {
        session,
        state,
        messageBuffer,
        reasoningProcessor,
        diffProcessor,
        appServerEventConverter,
        bindThreadId,
        clearAssistantStream,
        appendAssistantStream,
        acknowledgeAssistantTurn,
        notifyTurnSettled,
        scheduleReadyAfterTurn,
        clearReadyAfterTurnTimer,
        hasReadyAfterTurnTimer,
    } = options

    return (msg: Record<string, unknown>) => {
        const msgType = asString(msg.type)
        if (!msgType) return
        const eventTurnId = asString(msg.turn_id ?? msg.turnId)
        const isTerminalEvent = TERMINAL_EVENT_TYPES.has(msgType)

        if (shouldIgnoreTurnContentEvent(state, msgType, eventTurnId)) {
            return
        }

        if (msgType === 'thread_started') {
            const threadId = asString(msg.thread_id ?? msg.threadId)
            if (threadId) {
                bindThreadId(threadId)
            }
            return
        }

        if (
            !hasExplicitTurnContext({
                turnInFlight: state.turnInFlight,
                currentTurnId: state.currentTurnId,
            })
        ) {
            logger.debug(`[Codex] Ignoring ${msgType} outside an explicit user turn`)
            return
        }

        if (msgType === 'task_started') {
            const turnId = eventTurnId
            if (turnId) {
                if (state.currentTurnId && turnId !== state.currentTurnId) {
                    logger.debug(
                        `[Codex] Ignoring task_started for non-current turn ${turnId}; active=${state.currentTurnId}`
                    )
                    return
                }
                if (state.suppressAnonymousTurnEvents) {
                    rememberSuppressedTurn(state, turnId)
                }
                state.currentTurnId = turnId
                state.allowAnonymousTerminalEvent = false
            } else if (!state.currentTurnId) {
                state.allowAnonymousTerminalEvent = true
            }
        }

        if (isTerminalEvent) {
            if (
                shouldIgnoreTerminalEvent({
                    eventTurnId,
                    currentTurnId: state.currentTurnId,
                    turnInFlight: state.turnInFlight,
                    allowAnonymousTerminalEvent: state.allowAnonymousTerminalEvent,
                })
            ) {
                logger.debug(
                    `[Codex] Ignoring terminal event ${msgType} without matching turn context; ` +
                        `eventTurnId=${eventTurnId ?? 'none'}, activeTurn=${state.currentTurnId ?? 'none'}, ` +
                        `turnInFlight=${state.turnInFlight}, allowAnonymous=${state.allowAnonymousTerminalEvent}`
                )
                return
            }
            state.currentTurnId = null
            state.allowAnonymousTerminalEvent = false
        }

        if (isTerminalEvent) {
            clearAssistantStream()
        }

        dispatchBufferEvent(
            {
                session,
                messageBuffer,
                reasoningProcessor,
                diffProcessor,
                appendAssistantStream,
                acknowledgeAssistantTurn,
            },
            msgType,
            {
                ...msg,
                ...(msgType === 'exec_command_begin' ? { command: normalizeCommand(msg.command) ?? 'command' } : {}),
            }
        )

        if (msgType === 'task_started') {
            clearReadyAfterTurnTimer()
            state.turnInFlight = true
            if (!eventTurnId && !state.currentTurnId) {
                state.allowAnonymousTerminalEvent = true
            }
            if (!session.thinking) {
                session.onThinkingChange(true)
            }
        }

        if (isTerminalEvent) {
            state.turnInFlight = false
            state.allowAnonymousTerminalEvent = false
            notifyTurnSettled()
            if (session.thinking) {
                session.onThinkingChange(false)
            }
            diffProcessor.reset()
            appServerEventConverter.reset()
        }

        if (isTerminalEvent && !state.turnInFlight) {
            scheduleReadyAfterTurn()
        } else if (hasReadyAfterTurnTimer() && msgType !== 'task_started') {
            scheduleReadyAfterTurn()
        }

        dispatchCodexStructuredEvent(
            {
                session,
                messageBuffer,
                reasoningProcessor,
                diffProcessor,
                appendAssistantStream,
                acknowledgeAssistantTurn,
            },
            msgType,
            msg
        )
    }
}
