import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { settleTerminalTurn } from '@/agent/turnTerminalSettlement'
import type { RuntimeSessionClient } from '@/lib'

export type RuntimeTurnOwnerOptions<TBatch, TPrepared = TBatch> = {
    afterThinkingCleared?: () => Promise<void> | void
    getAbortSignal: () => AbortSignal
    label: string
    prepareTurn?: (batch: TBatch) => Promise<TPrepared> | TPrepared
    queueSize: () => number
    runTurn: (prepared: TPrepared) => Promise<void>
    sendReady?: () => void
    sessionClient: RuntimeSessionClient
    setThinking: (thinking: boolean) => void
    shouldExit: () => boolean
    waitForTurn: (signal: AbortSignal) => Promise<TBatch | null>
    onTurnError?: (error: unknown) => Promise<void> | void
    onTurnStart?: (prepared: TPrepared) => Promise<void> | void
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

            const prepared = options.prepareTurn ? await options.prepareTurn(batch) : (batch as unknown as TPrepared)
            await options.onTurnStart?.(prepared)
            options.setThinking(true)

            try {
                await options.runTurn(prepared)
            } catch (error) {
                await options.onTurnError?.(error)
            } finally {
                await settleTerminalTurn({
                    setThinking: options.setThinking,
                    afterThinkingCleared: options.afterThinkingCleared,
                    emitReady: async () => await readyScheduler.emitNow(),
                })
            }
        }
    } finally {
        readyScheduler.dispose()
    }
}
