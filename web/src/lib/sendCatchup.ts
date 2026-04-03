import type { AgentEvent } from '@/chat/types'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import type { DecryptedMessage } from '@/types/api'
import { isUserMessage } from '@/lib/messages'

export const SEND_CATCHUP_DELAY_MS = 500
export const SEND_CATCHUP_MAX_ATTEMPTS = 8

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
        type: 'no-reply'
        attemptCount: number
    }

interface CatchupOptions {
    createdAt: number
    maxAttempts?: number
    delayMs?: number
    syncOnce: () => Promise<CatchupSnapshot>
    onReplyDetected?: (info: { reply: DecryptedMessage; attempt: number }) => void
    sleep?: (ms: number) => Promise<void>
}

export function findFirstAgentReplyAfter(messages: readonly DecryptedMessage[], createdAt: number): DecryptedMessage | null {
    for (const message of messages) {
        if (message.createdAt < createdAt) {
            continue
        }
        if (isUserMessage(message)) {
            continue
        }

        const normalized = normalizeDecryptedMessage(message)
        if (normalized?.role === 'agent') {
            return message
        }
    }
    return null
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
        stage: stage === 'socket_update' || stage === 'callback_flush' ? stage : undefined
    }
}

function normalizeDriverSwitchedEvent(message: DecryptedMessage): DriverSwitchedEvent | null {
    const normalized = normalizeDecryptedMessage(message)
    if (!normalized || normalized.role !== 'event' || normalized.content.type !== 'driver-switched') {
        return null
    }

    return {
        type: 'driver-switched',
        previousDriver: typeof normalized.content.previousDriver === 'string' ? normalized.content.previousDriver : undefined,
        targetDriver: typeof normalized.content.targetDriver === 'string' ? normalized.content.targetDriver : undefined,
    }
}

export function shouldRunPostSwitchCatchup(messages: readonly DecryptedMessage[], createdAt: number): boolean {
    let latestDriverSwitchedAt: number | null = null
    let latestPriorUserMessageAt: number | null = null

    for (const message of messages) {
        if (message.createdAt >= createdAt) {
            continue
        }

        if (normalizeDriverSwitchedEvent(message)) {
            latestDriverSwitchedAt = message.createdAt
            continue
        }

        if (isUserMessage(message)) {
            latestPriorUserMessageAt = message.createdAt
        }
    }

    if (latestDriverSwitchedAt === null) {
        return false
    }

    return latestPriorUserMessageAt === null || latestPriorUserMessageAt < latestDriverSwitchedAt
}

function detectCatchupOutcome(messages: readonly DecryptedMessage[], createdAt: number): {
    type: 'reply-detected'
    reply: DecryptedMessage
} | {
    type: 'driver-switch-send-failed'
    event: DriverSwitchSendFailedEvent
} | null {
    for (const message of messages) {
        if (message.createdAt < createdAt) {
            continue
        }

        const failureEvent = normalizeDriverSwitchSendFailedEvent(message)
        if (failureEvent) {
            return {
                type: 'driver-switch-send-failed',
                event: failureEvent
            }
        }

        const reply = findFirstAgentReplyAfter([message], createdAt)
        if (reply) {
            return {
                type: 'reply-detected',
                reply
            }
        }
    }

    return null
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        globalThis.setTimeout(resolve, ms)
    })
}

export async function runSendCatchup(options: CatchupOptions): Promise<SendCatchupOutcome> {
    const maxAttempts = options.maxAttempts ?? SEND_CATCHUP_MAX_ATTEMPTS
    const delayMs = options.delayMs ?? SEND_CATCHUP_DELAY_MS
    const sleep = options.sleep ?? defaultSleep

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const snapshot = await options.syncOnce()
        const outcome = detectCatchupOutcome(snapshot.messages, options.createdAt)
        if (outcome?.type === 'reply-detected') {
            const replyOutcome: SendCatchupOutcome = {
                type: 'reply-detected',
                reply: outcome.reply,
                attempt: attempt + 1
            }
            options.onReplyDetected?.({ reply: outcome.reply, attempt: attempt + 1 })
            return replyOutcome
        }
        if (outcome?.type === 'driver-switch-send-failed') {
            return {
                type: 'driver-switch-send-failed',
                event: outcome.event,
                attempt: attempt + 1
            }
        }
        if (attempt === maxAttempts - 1) {
            break
        }
        await sleep(delayMs)
    }

    return {
        type: 'no-reply',
        attemptCount: maxAttempts
    }
}
