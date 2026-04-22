import { settleTerminalTurn, surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import type { MessageBuffer } from '@/ui/ink/messageBuffer'
import { logger } from '@/ui/logger'
import { asRecord, asString, type CodexRemoteRuntimeState, rememberSuppressedTurn } from './codexRemoteSupport'

export async function abortCodexTurn(options: {
    state: CodexRemoteRuntimeState
    appServerClient: {
        interruptTurn: (params: { threadId: string; turnId: string }) => Promise<unknown>
    }
    abortController: AbortController
    resetQueue: () => void
    clearAssistantStream: () => void
    setThinking: (thinking: boolean) => void
    resetPermissionHandler: () => void
    abortReasoning: () => void
    resetDiff: () => void
    replaceAbortController: (nextController: AbortController) => void
}): Promise<void> {
    try {
        if (options.state.currentTurnId) {
            rememberSuppressedTurn(options.state, options.state.currentTurnId)
        }
        options.state.suppressAnonymousTurnEvents = true
        if (options.state.currentThreadId && options.state.currentTurnId) {
            await options.appServerClient
                .interruptTurn({
                    threadId: options.state.currentThreadId,
                    turnId: options.state.currentTurnId,
                })
                .catch((error) => {
                    logger.debug('[Codex] Error interrupting app-server turn:', error)
                })
        }
        options.state.currentTurnId = null
        options.abortController.abort()
        options.resetQueue()
        options.clearAssistantStream()
        options.setThinking(false)
        options.resetPermissionHandler()
        options.abortReasoning()
        options.resetDiff()
    } finally {
        options.replaceAbortController(new AbortController())
    }
}

export function applyTurnStartResponse(state: CodexRemoteRuntimeState, turnResponse: unknown): void {
    const turn = asRecord(asRecord(turnResponse)?.turn)
    const turnId = asString(turn?.id)
    if (turnId) {
        if (state.suppressAnonymousTurnEvents) {
            rememberSuppressedTurn(state, turnId)
        }
        state.currentTurnId = turnId
        return
    }

    if (!state.currentTurnId) {
        state.allowAnonymousTerminalEvent = true
    }
}

export function recoverFromTurnStartError(options: {
    error: unknown
    state: CodexRemoteRuntimeState
    messageBuffer: MessageBuffer
    clearAssistantStream: () => void
    notifyTurnSettled: () => void
    sendSessionMessage: (message: string) => void
    resetThreadState: () => void
}): void {
    const isAbortError = options.error instanceof Error && options.error.name === 'AbortError'
    options.state.turnInFlight = false
    options.state.allowAnonymousTerminalEvent = false
    options.state.currentTurnId = null
    options.clearAssistantStream()
    options.notifyTurnSettled()

    if (isAbortError) {
        options.messageBuffer.addMessage('Aborted by user', 'status')
        options.sendSessionMessage('Aborted by user')
        return
    }

    logger.debug('[Codex] Failed to start app-server turn:', options.error)
    surfaceTerminalFailure({
        error: options.error,
        fallbackMessage: 'Process exited unexpectedly',
        sendSessionMessage: options.sendSessionMessage,
        addStatusMessage: (message) => options.messageBuffer.addMessage(message, 'status'),
    })
    options.resetThreadState()
}

export async function finalizeIdleTurn(options: {
    state: CodexRemoteRuntimeState
    clearAssistantStream: () => void
    resetPermissionHandler: () => void
    abortReasoning: () => void
    resetDiff: () => void
    resetEventConverter: () => void
    setThinking: (thinking: boolean) => void
    clearReadyAfterTurnTimer: () => void
    emitReady: () => Promise<boolean | undefined>
}): Promise<void> {
    if (options.state.turnInFlight) {
        return
    }

    await settleTerminalTurn({
        beforeThinkingCleared: () => {
            options.clearAssistantStream()
            options.resetPermissionHandler()
            options.abortReasoning()
            options.resetDiff()
            options.resetEventConverter()
        },
        setThinking: options.setThinking,
        afterThinkingCleared: () => {
            options.clearReadyAfterTurnTimer()
        },
        emitReady: options.emitReady,
    })
}
