import { AssistantStreamBridge } from '@/agent/assistantStreamBridge'
import {
    buildPiAssistantOutputRecord,
    buildPiToolResultOutputRecord,
    getPiAssistantTurnId,
    type PiAssistantMessage,
    type PiToolResultMessage,
} from './messageCodec'
import type { PiRpcClient } from './piRpcClient'
import type { PiSession } from './session'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isAssistantMessage(message: unknown): message is PiAssistantMessage {
    return isRecord(message) && message.role === 'assistant'
}

function isToolResultMessage(message: unknown): message is PiToolResultMessage {
    return isRecord(message) && message.role === 'toolResult'
}

export function subscribeToPiSessionEvents(options: { piSession: PiSession; rpcClient: PiRpcClient }): () => void {
    const assistantStream = new AssistantStreamBridge({
        append: ({ assistantTurnId, delta }) =>
            options.piSession.sendStreamUpdate({ kind: 'append', assistantTurnId, delta }),
        clear: ({ assistantTurnId }) =>
            options.piSession.sendStreamUpdate(
                assistantTurnId ? { kind: 'clear', assistantTurnId } : { kind: 'clear' }
            ),
    })
    return options.rpcClient.onEvent((event) => {
        switch (event.type) {
            case 'agent_end':
                assistantStream.clearDanglingAssistantTurn()
                return
            case 'message_start':
                if (isAssistantMessage(event.message)) {
                    assistantStream.beginAssistantTurn(getPiAssistantTurnId(event.message))
                }
                return
            case 'message_update': {
                const update = event.assistantMessageEvent
                if (isRecord(update) && update.type === 'text_delta' && typeof update.delta === 'string') {
                    assistantStream.appendTextDelta(update.delta)
                }
                return
            }
            case 'message_end':
                if (isAssistantMessage(event.message)) {
                    const assistantTurnId = getPiAssistantTurnId(event.message)
                    options.piSession.sendOutputMessage(buildPiAssistantOutputRecord(event.message), {
                        assistantTurnId,
                    })
                    assistantStream.acknowledgeDurableTurn(assistantTurnId)
                    return
                }
                if (isToolResultMessage(event.message)) {
                    options.piSession.sendOutputMessage(buildPiToolResultOutputRecord(event.message))
                }
                return
            default:
                return
        }
    })
}
