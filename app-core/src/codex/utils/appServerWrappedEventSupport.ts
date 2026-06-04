import { logger } from '@/ui/logger'
import {
    type AppServerEventState,
    asBoolean,
    asNumber,
    asRecord,
    asString,
    type ConvertedEvent,
    withTurnId,
} from './appServerEventParser'
import { createPlanUpdateEvent } from './planUpdateSupport'

const EMPTY_EVENTS: ConvertedEvent[] = []
const DEFAULT_WRAPPED_AGENT_MESSAGE_ID = 'agent-message'
const DEFAULT_WRAPPED_REASONING_ID = 'reasoning'
const IGNORED_WRAPPED_TYPES = new Set([
    'mcp_startup_update',
    'mcp_startup_complete',
    'skills_update_available',
    'stream_error',
    'warning',
    'context_compacted',
    'terminal_interaction',
    'user_message',
    'agent_reasoning_delta',
    'agent_reasoning',
    'agent_message',
])
const WRAPPED_TERMINAL_EVENT_TYPES = new Set(['task_started', 'task_complete', 'turn_aborted', 'task_failed'])

function pickString(candidates: unknown[]): string | null {
    for (const candidate of candidates) {
        const value = asString(candidate)
        if (value) {
            return value
        }
    }
    return null
}

function forwardWrappedItemLifecycle(
    msg: Record<string, unknown>,
    handleNotification: (method: string, params: unknown) => ConvertedEvent[]
): ConvertedEvent[] {
    return handleNotification(msg.type === 'item_started' ? 'item/started' : 'item/completed', {
        item: asRecord(msg.item) ?? {},
        itemId: asString(msg.item_id ?? msg.itemId ?? asRecord(msg.item)?.id),
        threadId: asString(msg.thread_id ?? msg.threadId),
        turnId: asString(msg.turn_id ?? msg.turnId),
    })
}

function handleWrappedTerminalEvent(msg: Record<string, unknown>, msgType: string): ConvertedEvent[] {
    const turnId = asString(msg.turn_id ?? msg.turnId)
    if ((msgType === 'task_complete' || msgType === 'turn_aborted' || msgType === 'task_failed') && !turnId) {
        logger.debug('[AppServerEventConverter] Ignoring wrapped terminal event without turn_id', { msgType })
        return EMPTY_EVENTS
    }
    if (msgType === 'task_failed') {
        const error = asString(msg.error ?? msg.message ?? asRecord(msg.error)?.message)
        return [withTurnId({ type: msgType, ...(error ? { error } : {}) }, turnId)]
    }
    return [withTurnId({ type: msgType }, turnId)]
}

function forwardWrappedDelta(options: {
    msg: Record<string, unknown>
    method: string
    itemIdFallback: string | null
    itemIdKeys: unknown[]
    deltaKeys: unknown[]
    handleNotification: (method: string, params: unknown) => ConvertedEvent[]
}): ConvertedEvent[] {
    const { msg, method, itemIdFallback, itemIdKeys, deltaKeys, handleNotification } = options
    const itemId = pickString(itemIdKeys) ?? itemIdFallback
    const delta = pickString(deltaKeys)
    return itemId && delta ? handleNotification(method, { itemId, delta }) : EMPTY_EVENTS
}

export function handleWrappedCodexEvent(
    _state: AppServerEventState,
    params: Record<string, unknown>,
    handleNotification: (method: string, params: unknown) => ConvertedEvent[]
): ConvertedEvent[] {
    const msg = asRecord(params.msg)
    if (!msg) {
        return EMPTY_EVENTS
    }

    const msgType = asString(msg.type)
    if (!msgType) {
        return EMPTY_EVENTS
    }

    if (msgType === 'item_started' || msgType === 'item_completed') {
        return forwardWrappedItemLifecycle(msg, handleNotification)
    }

    if (WRAPPED_TERMINAL_EVENT_TYPES.has(msgType)) {
        return handleWrappedTerminalEvent(msg, msgType)
    }

    if (msgType === 'agent_message_delta' || msgType === 'agent_message_content_delta') {
        return forwardWrappedDelta({
            msg,
            method: 'item/agentMessage/delta',
            itemIdFallback: DEFAULT_WRAPPED_AGENT_MESSAGE_ID,
            itemIdKeys: [msg.item_id, msg.itemId, msg.id],
            deltaKeys: [msg.delta, msg.text, msg.message],
            handleNotification,
        })
    }

    if (msgType === 'reasoning_content_delta') {
        return forwardWrappedDelta({
            msg,
            method: 'item/reasoning/summaryTextDelta',
            itemIdFallback: DEFAULT_WRAPPED_REASONING_ID,
            itemIdKeys: [msg.item_id, msg.itemId, msg.id],
            deltaKeys: [msg.delta, msg.text, msg.message],
            handleNotification,
        })
    }

    if (msgType === 'agent_reasoning_section_break') {
        const itemId = asString(msg.item_id ?? msg.itemId ?? msg.id) ?? DEFAULT_WRAPPED_REASONING_ID
        const summaryIndex = asNumber(msg.summary_index ?? msg.summaryIndex)
        return handleNotification('item/reasoning/summaryPartAdded', {
            itemId,
            ...(summaryIndex !== null ? { summaryIndex } : {}),
        })
    }

    if (msgType === 'exec_command_output_delta') {
        return forwardWrappedDelta({
            msg,
            method: 'item/commandExecution/outputDelta',
            itemIdFallback: null,
            itemIdKeys: [msg.call_id, msg.callId, msg.item_id ?? msg.itemId ?? msg.id],
            deltaKeys: [msg.delta, msg.output, msg.stdout, msg.text],
            handleNotification,
        })
    }

    if (msgType === 'error') {
        const errorRecord = asRecord(msg.error)
        const willRetry =
            asBoolean(msg.will_retry ?? msg.willRetry ?? errorRecord?.will_retry ?? errorRecord?.willRetry) ?? false
        if (willRetry) {
            return EMPTY_EVENTS
        }
        const error = asString(msg.message ?? msg.reason ?? errorRecord?.message)
        return error ? [{ type: 'task_failed', error }] : EMPTY_EVENTS
    }

    if (msgType === 'plan_update') {
        return createPlanUpdateEvent(msg)
    }

    if (IGNORED_WRAPPED_TYPES.has(msgType)) {
        return EMPTY_EVENTS
    }

    return [msg as ConvertedEvent]
}
