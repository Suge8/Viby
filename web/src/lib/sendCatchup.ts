import type { DecryptedMessage } from '@/types/api'
import { isUserMessage } from '@/lib/messages'

export const SEND_CATCHUP_DELAY_MS = 500
export const SEND_CATCHUP_MAX_ATTEMPTS = 8

type CatchupSnapshot = {
    messages: DecryptedMessage[]
}

interface CatchupOptions {
    createdAt: number
    maxAttempts?: number
    delayMs?: number
    syncOnce: () => Promise<CatchupSnapshot>
    onReplyDetected?: (info: { reply: DecryptedMessage; attempt: number }) => void
    sleep?: (ms: number) => Promise<void>
}

function findFirstAgentReplyAfter(messages: DecryptedMessage[], createdAt: number): DecryptedMessage | null {
    for (const message of messages) {
        if (message.createdAt < createdAt) {
            continue
        }
        if (!isUserMessage(message)) {
            return message
        }
    }
    return null
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        globalThis.setTimeout(resolve, ms)
    })
}

export async function runSendCatchup(options: CatchupOptions): Promise<void> {
    const maxAttempts = options.maxAttempts ?? SEND_CATCHUP_MAX_ATTEMPTS
    const delayMs = options.delayMs ?? SEND_CATCHUP_DELAY_MS
    const sleep = options.sleep ?? defaultSleep

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const snapshot = await options.syncOnce()
        const reply = findFirstAgentReplyAfter(snapshot.messages, options.createdAt)
        if (reply) {
            options.onReplyDetected?.({ reply, attempt: attempt + 1 })
            return
        }
        if (attempt === maxAttempts - 1) {
            return
        }
        await sleep(delayMs)
    }
}
