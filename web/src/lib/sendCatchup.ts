import { normalizeDecryptedMessage } from '@/chat/normalize'
import type { AgentEvent } from '@/chat/types'
import { isUserMessage } from '@/lib/messages'
import type { DecryptedMessage } from '@/types/api'

export const SEND_CATCHUP_TIMEOUT_MS = 1250

export type DriverSwitchSendFailedEvent = Extract<AgentEvent, { type: 'driver-switch-send-failed' }>

type CatchupSnapshot = {
    messages: DecryptedMessage[]
}

type DriverSwitchedEvent = Extract<AgentEvent, { type: 'driver-switched' }>

export type SendCatchupOutcome =
    | {
          type: 'reply-detected'
          reply: DecryptedMessage
          attempt: number
      }
    | {
          type: 'driver-switch-send-failed'
          event: DriverSwitchSendFailedEvent
          attempt: number
      }
    | {
          type: 'no-evidence'
          attemptCount: number
      }

interface CatchupOptions {
    createdAt: number
    readSnapshot: () => CatchupSnapshot
    syncOnce?: () => Promise<void>
    subscribe?: (listener: () => void) => () => void
    timeoutMs?: number
    onReplyDetected?: (info: { reply: DecryptedMessage; attempt: number }) => void
}

export function findFirstAgentReplyAfter(
    messages: readonly DecryptedMessage[],
    createdAt: number
): DecryptedMessage | null {
    for (const message of messages) {
        if (message.createdAt < createdAt) {
            continue
        }
        if (isAgentReplyMessage(message)) {
            return message
        }
    }
    return null
}

function isAgentReplyMessage(message: DecryptedMessage): boolean {
    if (isUserMessage(message)) {
        return false
    }

    return normalizeDecryptedMessage(message)?.role === 'agent'
}

function normalizeDriverSwitchSendFailedEvent(message: DecryptedMessage): DriverSwitchSendFailedEvent | null {
    const normalized = normalizeDecryptedMessage(message)
    if (!normalized || normalized.role !== 'event' || normalized.content.type !== 'driver-switch-send-failed') {
        return null
    }

    const code = normalized.content.code
    const stage = normalized.content.stage

    return {
        type: 'driver-switch-send-failed',
        code: code === 'empty_first_turn' || code === 'timeout' || code === 'unknown' ? code : undefined,
        stage: stage === 'socket_update' || stage === 'callback_flush' ? stage : undefined,
    }
}

function normalizeDriverSwitchedEvent(message: DecryptedMessage): DriverSwitchedEvent | null {
    const normalized = normalizeDecryptedMessage(message)
    if (!normalized || normalized.role !== 'event' || normalized.content.type !== 'driver-switched') {
        return null
    }

    return {
        type: 'driver-switched',
        previousDriver:
            typeof normalized.content.previousDriver === 'string' ? normalized.content.previousDriver : undefined,
        targetDriver: typeof normalized.content.targetDriver === 'string' ? normalized.content.targetDriver : undefined,
    }
}

export function shouldRunPostSwitchCatchup(messages: readonly DecryptedMessage[], createdAt: number): boolean {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message.createdAt >= createdAt) {
            continue
        }

        if (isUserMessage(message)) {
            return false
        }
        if (normalizeDriverSwitchedEvent(message)) {
            return true
        }
    }

    return false
}

function detectCatchupOutcome(
    messages: readonly DecryptedMessage[],
    createdAt: number
):
    | {
          type: 'reply-detected'
          reply: DecryptedMessage
      }
    | {
          type: 'driver-switch-send-failed'
          event: DriverSwitchSendFailedEvent
      }
    | null {
    for (const message of messages) {
        if (message.createdAt < createdAt) {
            continue
        }

        const failureEvent = normalizeDriverSwitchSendFailedEvent(message)
        if (failureEvent) {
            return {
                type: 'driver-switch-send-failed',
                event: failureEvent,
            }
        }

        if (isAgentReplyMessage(message)) {
            return {
                type: 'reply-detected',
                reply: message,
            }
        }
    }

    return null
}

function readCatchupOutcome(options: {
    createdAt: number
    attempt: number
    messages: readonly DecryptedMessage[]
    onReplyDetected?: (info: { reply: DecryptedMessage; attempt: number }) => void
}): SendCatchupOutcome | null {
    const outcome = detectCatchupOutcome(options.messages, options.createdAt)
    if (outcome?.type === 'reply-detected') {
        const replyOutcome: SendCatchupOutcome = {
            type: 'reply-detected',
            reply: outcome.reply,
            attempt: options.attempt,
        }
        options.onReplyDetected?.({ reply: outcome.reply, attempt: options.attempt })
        return replyOutcome
    }
    if (outcome?.type === 'driver-switch-send-failed') {
        return {
            type: 'driver-switch-send-failed',
            event: outcome.event,
            attempt: options.attempt,
        }
    }

    return null
}

function waitForCatchupEvidence(options: {
    subscribe: (listener: () => void) => () => void
    timeoutMs: number
    readOutcome: () => SendCatchupOutcome | null
    getAttemptCount: () => number
}): Promise<SendCatchupOutcome> {
    return new Promise((resolve) => {
        let settled = false
        let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
        let unsubscribe: (() => void) | undefined
        const finish = (outcome: SendCatchupOutcome) => {
            if (settled) {
                return
            }
            settled = true
            if (timeoutId !== null) {
                globalThis.clearTimeout(timeoutId)
            }
            unsubscribe?.()
            resolve(outcome)
        }
        unsubscribe = options.subscribe(() => {
            const outcome = options.readOutcome()
            if (outcome) {
                finish(outcome)
            }
        })
        const currentOutcome = options.readOutcome()
        if (currentOutcome) {
            finish(currentOutcome)
            return
        }
        timeoutId = globalThis.setTimeout(() => {
            finish({
                type: 'no-evidence',
                attemptCount: options.getAttemptCount(),
            })
        }, options.timeoutMs)
    })
}

export async function runSendCatchup(options: CatchupOptions): Promise<SendCatchupOutcome> {
    let attemptCount = 0
    const readOutcome = () => {
        attemptCount += 1
        return readCatchupOutcome({
            createdAt: options.createdAt,
            attempt: attemptCount,
            messages: options.readSnapshot().messages,
            onReplyDetected: options.onReplyDetected,
        })
    }

    const currentOutcome = readOutcome()
    if (currentOutcome) {
        return currentOutcome
    }

    // This bounded catch-up only bridges the race to a durable failure event or
    // a very fast first reply after switching drivers. Silence is not failure.
    await options.syncOnce?.()
    const syncedOutcome = readOutcome()
    if (syncedOutcome) {
        return syncedOutcome
    }

    const timeoutMs = options.timeoutMs ?? SEND_CATCHUP_TIMEOUT_MS
    if (!options.subscribe || timeoutMs <= 0) {
        return {
            type: 'no-evidence',
            attemptCount,
        }
    }

    return waitForCatchupEvidence({
        subscribe: options.subscribe,
        timeoutMs,
        readOutcome,
        getAttemptCount: () => attemptCount,
    })
}
