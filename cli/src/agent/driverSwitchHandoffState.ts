import { formatSessionHandoffPrompt } from '@viby/protocol'
import type { SessionHandoffSnapshot } from '@viby/protocol/types'

export const EMPTY_DRIVER_SWITCH_FIRST_TURN_ERROR =
    'Cannot inject driver switch continuity into an empty first user turn'

type PendingDriverSwitchHandoffState = {
    consumeForUserMessage: (message: string) => string | undefined
}

export function createPendingDriverSwitchHandoffState(
    snapshot?: SessionHandoffSnapshot
): PendingDriverSwitchHandoffState {
    let pendingInstructions = snapshot
        ? formatSessionHandoffPrompt(snapshot)
        : undefined

    return {
        consumeForUserMessage(message: string): string | undefined {
            if (pendingInstructions === undefined) {
                return undefined
            }

            if (message.trim().length === 0) {
                pendingInstructions = undefined
                throw new Error(EMPTY_DRIVER_SWITCH_FIRST_TURN_ERROR)
            }

            const instructions = pendingInstructions
            pendingInstructions = undefined
            return instructions
        }
    }
}
