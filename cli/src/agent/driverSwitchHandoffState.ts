import { formatSessionHandoffPrompt } from '@viby/protocol'
import type { SessionHandoffSnapshot } from '@viby/protocol/types'

export const EMPTY_SESSION_CONTINUITY_FIRST_TURN_ERROR =
    'Cannot inject session continuity into an empty first user turn'

type PendingSessionContinuityHandoffState = {
    consumeForUserMessage: (message: string) => string | undefined
}

export function createPendingSessionContinuityHandoffState(
    snapshot?: SessionHandoffSnapshot
): PendingSessionContinuityHandoffState {
    let pendingInstructions = snapshot ? formatSessionHandoffPrompt(snapshot) : undefined

    return {
        consumeForUserMessage(message: string): string | undefined {
            if (pendingInstructions === undefined) {
                return undefined
            }

            if (message.trim().length === 0) {
                pendingInstructions = undefined
                throw new Error(EMPTY_SESSION_CONTINUITY_FIRST_TURN_ERROR)
            }

            const instructions = pendingInstructions
            pendingInstructions = undefined
            return instructions
        },
    }
}
