import { surfaceTerminalFailure } from '@/agent/turnTerminalSettlement'
import type { MessageBuffer } from '@/ui/ink/messageBuffer'
import type { CursorSession } from './session'

const CURSOR_FAILURE_PREFIX = 'Cursor Agent failed'
const CURSOR_FAILURE_FALLBACK_MESSAGE = `${CURSOR_FAILURE_PREFIX}. Check logs for details.`

export type CursorProcessResult = Readonly<{
    code: number | null
    signal: NodeJS.Signals | null
    aborted: boolean
}>

export function surfaceCursorTerminalFailure(options: {
    session: CursorSession
    messageBuffer: Pick<MessageBuffer, 'addMessage'>
    error: unknown
}): void {
    surfaceTerminalFailure({
        error: options.error,
        fallbackMessage: CURSOR_FAILURE_FALLBACK_MESSAGE,
        detailPrefix: CURSOR_FAILURE_PREFIX,
        sendSessionMessage: (message) => options.session.sendSessionEvent({ type: 'message', message }),
        addStatusMessage: (message) => options.messageBuffer.addMessage(message, 'status'),
    })
}

export function getCursorTerminalFailureError(result: CursorProcessResult): Error | null {
    if (result.signal !== null) {
        return new Error(`terminated by signal ${result.signal}`)
    }

    if (result.code !== null && result.code !== 0) {
        return new Error(`exited with code ${result.code}`)
    }

    return null
}
