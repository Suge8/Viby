import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { formatTerminalFailureMessage, settleTerminalTurn } from '@/agent/turnTerminalSettlement'
import type { ApiSessionClient } from '@/lib'
import { logger } from '@/ui/logger'
import type { MessageQueue2 } from '@/utils/MessageQueue2'
import type { PiRpcClient } from './piRpcClient'
import { isPiRpcConnectionError } from './piRpcProtocol'
import type { PiRuntimeState } from './runPiRuntimeState'
import type { PiSession } from './session'
import type { PiMode } from './types'

function surfacePiTurnFailure(options: { error: unknown; piSession: PiSession }): void {
    const detail = formatTerminalFailureMessage({
        error: options.error,
        fallbackMessage: 'Pi reply did not complete. Check logs for details.',
        detailPrefix: 'Pi turn failed',
    })
    options.piSession.sendSessionEvent({ type: 'assistant-error', detail })
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

        options.piSession.onThinkingChange(true)
        let shouldSettleTurn = true
        try {
            await options.applyRuntimeState(batch.mode)
            await options.rpcClient.prompt(batch.message)
        } catch (error) {
            if (options.getAbortRequested()) {
                logger.debug('[pi] Prompt aborted')
            } else {
                logger.debug('[pi] Prompt failed', error)
                surfacePiTurnFailure({ error, piSession: options.piSession })
                if (isPiRpcConnectionError(error)) {
                    shouldSettleTurn = false
                    options.piSession.onThinkingChange(false)
                    throw error
                }
            }
        } finally {
            options.resetAbortRequested()
            if (shouldSettleTurn) {
                await settleTerminalTurn({
                    setThinking: (thinking) => options.piSession.onThinkingChange(thinking),
                    afterThinkingCleared: async () => {
                        if (options.messageQueue.size() === 0) await options.restoreSelectedRuntimeState()
                    },
                    emitReady: async () => await readyScheduler.emitNow(),
                })
            }
        }
    }
    readyScheduler.dispose()
}
