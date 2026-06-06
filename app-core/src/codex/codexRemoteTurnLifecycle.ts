import { surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
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
    resetPermissionHandler: () => void
    abortReasoning: () => void
    resetDiff: () => void
    notifyTurnSettled: () => void
    replaceAbortController: (nextController: AbortController) => void
}): Promise<void> {
    try {
        if (options.state.currentTurnId) {
            rememberSuppressedTurn(options.state, options.state.currentTurnId)
        }
        options.state.suppressAnonymousTurnEvents = true
        const turnsToInterrupt = collectActiveTurns(options.state)
        const interruptResults = await Promise.allSettled(
            turnsToInterrupt.map((turn) =>
                options.appServerClient.interruptTurn({
                    threadId: turn.threadId,
                    turnId: turn.turnId,
                })
            )
        )
        for (let index = 0; index < interruptResults.length; index += 1) {
            const result = interruptResults[index]
            const turn = turnsToInterrupt[index]
            if (result.status === 'fulfilled') {
                continue
            }
            logger.debug(
                `[Codex] Error interrupting ${turn.role} app-server turn ` + `${turn.turnId} on ${turn.threadId}:`,
                result.reason
            )
        }
        options.state.activeChildTurns.clear()
        options.state.turnInFlight = false
        options.state.currentTurnId = null
        options.state.allowAnonymousTerminalEvent = false
        options.abortController.abort()
        options.resetQueue()
        options.clearAssistantStream()
        options.resetPermissionHandler()
        options.abortReasoning()
        options.resetDiff()
        options.notifyTurnSettled()
    } finally {
        options.replaceAbortController(new AbortController())
    }
}

function collectActiveTurns(state: CodexRemoteRuntimeState): Array<{
    threadId: string
    turnId: string
    role: 'parent' | 'child'
}> {
    const turns: Array<{ threadId: string; turnId: string; role: 'parent' | 'child' }> = []
    if (state.currentThreadId && state.currentTurnId) {
        turns.push({ threadId: state.currentThreadId, turnId: state.currentTurnId, role: 'parent' })
    }
    for (const [threadId, turnId] of state.activeChildTurns) {
        turns.push({ threadId, turnId, role: 'child' })
    }
    return turns
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

export async function cleanupCodexTurn(options: {
    clearAssistantStream: () => void
    resetPermissionHandler: () => void
    abortReasoning: () => void
    resetDiff: () => void
    resetEventConverter: () => void
}): Promise<void> {
    options.clearAssistantStream()
    options.resetPermissionHandler()
    options.abortReasoning()
    options.resetDiff()
    options.resetEventConverter()
}
