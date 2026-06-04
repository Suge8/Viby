import { logger } from '@/ui/logger'
import { resolveDriverSwitchSendFailureCode } from './runtimeSessionState'
import type { UserMessage } from './types'

export type DriverSwitchSendFailureStage = 'runtime_update' | 'callback_flush'
type DriverSwitchSendFailurePayload = {
    stage: DriverSwitchSendFailureStage
    code: ReturnType<typeof resolveDriverSwitchSendFailureCode>
}
type QueuedUserMessage = {
    message: UserMessage
    localId?: string
}
type UserMessageCallback = (message: UserMessage, localId?: string) => void

export type RuntimeMessageDelivery = {
    onUserMessage: (callback: UserMessageCallback) => void
    enqueueUserMessage: (message: UserMessage, localId?: string) => void
}

export function createRuntimeMessageDelivery(options: {
    onDriverSwitchSendFailure: (payload: DriverSwitchSendFailurePayload) => void
    onUserMessageObserved?: (message: UserMessage) => void
}): RuntimeMessageDelivery {
    let pendingMessages: QueuedUserMessage[] = []
    let pendingMessageCallback: UserMessageCallback | null = null

    const emitDriverSwitchSendFailure = (stage: DriverSwitchSendFailureStage, error: unknown): void => {
        const code = resolveDriverSwitchSendFailureCode(error)
        logger.debug('[API] Driver switch send failed during user message delivery', { stage, code })

        try {
            options.onDriverSwitchSendFailure({ stage, code })
        } catch (eventError) {
            logger.debug('[API] Failed to emit driver switch send failure event', {
                stage,
                code,
                error: eventError,
            })
        }
    }

    const deliverUserMessage = (
        callback: UserMessageCallback,
        message: UserMessage,
        localId: string | undefined,
        stage: DriverSwitchSendFailureStage
    ): void => {
        try {
            callback(message, localId)
        } catch (error) {
            emitDriverSwitchSendFailure(stage, error)
        }
    }

    const observeUserMessage = (message: UserMessage): void => {
        try {
            options.onUserMessageObserved?.(message)
        } catch (error) {
            logger.debug('[API] Failed to observe user message side effects', error)
        }
    }

    const flushPendingMessages = (): void => {
        const callback = pendingMessageCallback
        if (!callback || pendingMessages.length === 0) {
            return
        }

        const queuedMessages = pendingMessages
        pendingMessages = []
        for (const queued of queuedMessages) {
            deliverUserMessage(callback, queued.message, queued.localId, 'callback_flush')
        }
    }

    return {
        onUserMessage(callback: UserMessageCallback): void {
            pendingMessageCallback = callback
            flushPendingMessages()
        },
        enqueueUserMessage(message: UserMessage, localId?: string): void {
            observeUserMessage(message)
            const callback = pendingMessageCallback
            if (callback) {
                deliverUserMessage(callback, message, localId, 'runtime_update')
                return
            }
            pendingMessages.push({ message, localId })
        },
    }
}
