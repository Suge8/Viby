import { randomUUID } from 'node:crypto'
import { logger } from '@/ui/logger'

export type CodexSessionEvent = {
    timestamp?: string
    type: string
    payload?: unknown
}

export type CodexMessage =
    | {
          type: 'message'
          message: string
          id: string
      }
    | {
          type: 'reasoning'
          message: string
          id: string
      }
    | {
          type: 'reasoning-delta'
          delta: string
      }
    | {
          type: 'token_count'
          info: Record<string, unknown>
          id: string
      }
    | {
          type: 'tool-call'
          name: string
          callId: string
          input: unknown
          id: string
      }
    | {
          type: 'tool-call-result'
          callId: string
          output: unknown
          id: string
      }

export type CodexConversionResult = {
    sessionId?: string
    message?: CodexMessage
    userMessage?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function parseCodexSessionEvent(rawEvent: unknown): CodexSessionEvent | null {
    const event = asRecord(rawEvent)
    const type = event ? asString(event.type) : null
    if (!type) {
        return null
    }

    const timestamp = event ? (asString(event.timestamp) ?? undefined) : undefined
    return {
        type,
        payload: event?.payload,
        ...(timestamp ? { timestamp } : {}),
    }
}

function parseArguments(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value
    }

    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            return JSON.parse(trimmed)
        } catch (error) {
            logger.debug('[codexEventConverter] Failed to parse function_call arguments as JSON:', error)
        }
    }

    return value
}

function extractCallId(payload: Record<string, unknown>): string | null {
    const candidates = ['call_id', 'callId', 'tool_call_id', 'toolCallId', 'id'] as const

    for (const key of candidates) {
        const value = payload[key]
        if (typeof value === 'string' && value.length > 0) {
            return value
        }
    }

    return null
}

export function convertCodexEvent(rawEvent: unknown): CodexConversionResult | null {
    const parsed = parseCodexSessionEvent(rawEvent)
    if (!parsed) {
        return null
    }

    const { type, payload } = parsed
    const payloadRecord = asRecord(payload)

    if (type === 'session_meta') {
        const sessionId = payloadRecord ? asString(payloadRecord.id) : null
        if (!sessionId) {
            return null
        }
        return { sessionId }
    }

    if (!payloadRecord) {
        return null
    }

    if (type === 'event_msg') {
        const eventType = asString(payloadRecord.type)
        if (!eventType) {
            return null
        }

        if (eventType === 'user_message') {
            const message =
                asString(payloadRecord.message) ?? asString(payloadRecord.text) ?? asString(payloadRecord.content)
            if (!message) {
                return null
            }
            return {
                userMessage: message,
            }
        }

        if (eventType === 'agent_message') {
            const message = asString(payloadRecord.message)
            if (!message) {
                return null
            }
            return {
                message: {
                    type: 'message',
                    message,
                    id: randomUUID(),
                },
            }
        }

        if (eventType === 'agent_reasoning') {
            const message = asString(payloadRecord.text) ?? asString(payloadRecord.message)
            if (!message) {
                return null
            }
            return {
                message: {
                    type: 'reasoning',
                    message,
                    id: randomUUID(),
                },
            }
        }

        if (eventType === 'agent_reasoning_delta') {
            const delta =
                asString(payloadRecord.delta) ?? asString(payloadRecord.text) ?? asString(payloadRecord.message)
            if (!delta) {
                return null
            }
            return {
                message: {
                    type: 'reasoning-delta',
                    delta,
                },
            }
        }

        if (eventType === 'token_count') {
            const info = asRecord(payloadRecord.info)
            if (!info) {
                return null
            }
            return {
                message: {
                    type: 'token_count',
                    info,
                    id: randomUUID(),
                },
            }
        }

        return null
    }

    if (type === 'response_item') {
        const itemType = asString(payloadRecord.type)
        if (!itemType) {
            return null
        }

        if (itemType === 'function_call') {
            const name = asString(payloadRecord.name)
            const callId = extractCallId(payloadRecord)
            if (!name || !callId) {
                return null
            }
            return {
                message: {
                    type: 'tool-call',
                    name,
                    callId,
                    input: parseArguments(payloadRecord.arguments),
                    id: randomUUID(),
                },
            }
        }

        if (itemType === 'function_call_output') {
            const callId = extractCallId(payloadRecord)
            if (!callId) {
                return null
            }
            return {
                message: {
                    type: 'tool-call-result',
                    callId,
                    output: payloadRecord.output,
                    id: randomUUID(),
                },
            }
        }

        return null
    }

    return null
}
