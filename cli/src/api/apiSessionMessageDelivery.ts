import { logger } from '@/ui/logger'
import { resolveDriverSwitchSendFailureCode } from './apiSessionState'
import type { UserMessage } from './types'

export type DriverSwitchSendFailureStage = 'socket_update' | 'callback_flush'
type DriverSwitchSendFailurePayload = {
    stage: DriverSwitchSendFailureStage
    code: ReturnType<typeof resolveDriverSwitchSendFailureCode>
}
type UserMessageCallback = (message: UserMessage) => void

export type ApiSessionMessageDelivery = {
    onUserMessage: (callback: UserMessageCallback) => void
    enqueueUserMessage: (message: UserMessage) => void
}

export function createApiSessionMessageDelivery(options: {
    onDriverSwitchSendFailure: (payload: DriverSwitchSendFailurePayload) => void
    onUserMessageObserved?: (message: UserMessage) => void
}): ApiSessionMessageDelivery {
    let pendingMessages: UserMessage[] = []
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
        stage: DriverSwitchSendFailureStage
    ): void => {
        try {
            callback(message)
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
        for (const message of queuedMessages) {
            deliverUserMessage(callback, message, 'callback_flush')
        }
    }

    return {
        onUserMessage(callback: (message: UserMessage) => void): void {
            pendingMessageCallback = callback
            flushPendingMessages()
        },
        enqueueUserMessage(message: UserMessage): void {
            observeUserMessage(message)
            const callback = pendingMessageCallback
            if (callback) {
                deliverUserMessage(callback, message, 'socket_update')
                return
            }
            pendingMessages.push(message)
        },
    }
}
