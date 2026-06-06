import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { settleTerminalTurn } from '@/agent/turnTerminalSettlement'
import type { RuntimeSessionClient } from '@/lib'

export type RuntimeTurnEndReason = 'success' | 'error' | 'abort'
export type RuntimeBeforeTurnResult<TPrepared> = { type: 'handled' } | { type: 'continue'; prepared: TPrepared }

export type RuntimeTurnOwnerOptions<TBatch, TPrepared = TBatch> = {
    afterTurn?: (reason: RuntimeTurnEndReason) => Promise<void> | void
    beforeTurn?: (batch: TBatch) => Promise<RuntimeBeforeTurnResult<TPrepared>> | RuntimeBeforeTurnResult<TPrepared>
    getAbortSignal: () => AbortSignal
    label: string
    queueSize: () => number
    runTurn: (prepared: TPrepared) => Promise<void>
    sendReady?: () => void
    sessionClient: RuntimeSessionClient
    setThinking: (thinking: boolean) => void
    shouldExit: () => boolean
    waitForTurn: (signal: AbortSignal) => Promise<TBatch | null>
    waitUntilReadyForNextTurn?: () => Promise<void> | void
    onTurnError?: (error: unknown) => Promise<void> | void
}

export async function runRuntimeTurnOwner<TBatch, TPrepared = TBatch>(
    options: RuntimeTurnOwnerOptions<TBatch, TPrepared>
): Promise<void> {
    const readyScheduler = createReadyEventScheduler({
        label: options.label,
        queueSize: options.queueSize,
        shouldExit: options.shouldExit,
        flushBeforeReady: () => flushReadyStateBeforeReady(options.sessionClient),
        sendReady: options.sendReady ?? (() => options.sessionClient.sendSessionEvent({ type: 'ready' })),
    })

    try {
        while (!options.shouldExit()) {
            const signal = options.getAbortSignal()
            const batch = await options.waitForTurn(signal)
            if (!batch) {
                if (signal.aborted && !options.shouldExit()) continue
                break
            }

            const beforeTurn = options.beforeTurn
                ? await options.beforeTurn(batch)
                : { type: 'continue' as const, prepared: batch as unknown as TPrepared }
            if (beforeTurn.type === 'handled') {
                continue
            }

            let reason: RuntimeTurnEndReason = 'success'
            options.setThinking(true)

            try {
                await options.runTurn(beforeTurn.prepared)
                if (signal.aborted) {
                    reason = 'abort'
                }
            } catch (error) {
                reason = isAbort(error, signal) ? 'abort' : 'error'
                await options.onTurnError?.(error)
            } finally {
                await settleTerminalTurn({
                    beforeThinkingCleared: async () => {
                        await options.waitUntilReadyForNextTurn?.()
                    },
                    setThinking: options.setThinking,
                    afterThinkingCleared: async () => {
                        await options.afterTurn?.(reason)
                    },
                    emitReady: async () => await readyScheduler.emitNow(),
                })
            }
        }
    } finally {
        readyScheduler.dispose()
    }
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
    return signal.aborted || (error instanceof Error && error.name === 'AbortError')
}
