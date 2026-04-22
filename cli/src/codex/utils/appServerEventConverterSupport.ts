import { appendUniqueBufferedDelta } from './appServerEventConverterItemSupport'
import { handleItemLifecycle } from './appServerEventConverterLifecycle'
import {
    type AppServerEventState,
    asBoolean,
    asNumber,
    asRecord,
    asString,
    type ConvertedEvent,
    extractItemId,
    extractThreadId,
    extractTurnId,
    withTurnId,
} from './appServerEventParser'
import { createPlanUpdateEvent } from './planUpdateSupport'

type NotificationHandler = (state: AppServerEventState, params: Record<string, unknown>) => ConvertedEvent[]

const EMPTY_EVENTS: ConvertedEvent[] = []
const IGNORED_NOTIFICATION_METHODS = new Set(['account/rateLimits/updated'])
const DEFAULT_REASONING_ITEM_ID = 'reasoning'

function handleThreadStarted(_state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const threadId = extractThreadId(params)
    return threadId ? [{ type: 'thread_started', thread_id: threadId }] : EMPTY_EVENTS
}

function handleTurnStarted(_state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const turn = asRecord(params.turn) ?? params
    return [withTurnId({ type: 'task_started' }, asString(turn.turnId ?? turn.turn_id ?? turn.id))]
}

function createPlanProposalEvent(itemId: string, message: string, turnId: string | null): ConvertedEvent {
    return withTurnId({ type: 'plan_proposal', item_id: itemId, message }, turnId)
}

function flushPendingPlanProposalEvents(state: AppServerEventState, turnId: string | null): ConvertedEvent[] {
    if (!turnId) {
        return EMPTY_EVENTS
    }

    const events: ConvertedEvent[] = []
    for (const [itemId, message] of state.planBuffers.entries()) {
        if (state.planTurnIds.get(itemId) !== turnId || state.completedPlanItems.has(itemId)) {
            continue
        }

        state.completedPlanItems.add(itemId)
        state.planBuffers.delete(itemId)
        state.planTurnIds.delete(itemId)
        state.lastPlanDeltaByItemId.delete(itemId)
        events.push(createPlanProposalEvent(itemId, message, turnId))
    }

    return events
}

function handleTurnCompleted(state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const turn = asRecord(params.turn) ?? params
    const status = asString(params.status ?? turn.status)?.toLowerCase()
    const turnId = asString(turn.turnId ?? turn.turn_id ?? turn.id)
    const errorMessage = asString(params.error ?? params.message ?? params.reason)
    const pendingPlanEvents = flushPendingPlanProposalEvents(state, turnId)

    if (status === 'interrupted' || status === 'cancelled' || status === 'canceled') {
        return [...pendingPlanEvents, withTurnId({ type: 'turn_aborted' }, turnId)]
    }
    if (status === 'failed' || status === 'error') {
        return [
            ...pendingPlanEvents,
            withTurnId({ type: 'task_failed', ...(errorMessage ? { error: errorMessage } : {}) }, turnId),
        ]
    }
    return [...pendingPlanEvents, withTurnId({ type: 'task_complete' }, turnId)]
}

function handleTurnDiff(_state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const diff = asString(params.diff ?? params.unified_diff ?? params.unifiedDiff)
    return diff ? [{ type: 'turn_diff', unified_diff: diff }] : EMPTY_EVENTS
}

function handleTurnPlanUpdated(_state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    return createPlanUpdateEvent(params)
}

function handleTokenUsage(_state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const info = asRecord(params.tokenUsage ?? params.token_usage ?? params) ?? {}
    return [{ type: 'token_count', info }]
}

function handleError(_state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    if (asBoolean(params.will_retry ?? params.willRetry) ?? false) {
        return EMPTY_EVENTS
    }
    const message = asString(params.message) ?? asString(asRecord(params.error)?.message)
    return message ? [{ type: 'task_failed', error: message }] : EMPTY_EVENTS
}

function handleAgentMessageDelta(state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const itemId = extractItemId(params)
    const turnId = extractTurnId(params)
    const delta = asString(params.delta ?? params.text ?? params.message)
    if (
        !appendUniqueBufferedDelta({
            itemId,
            delta,
            lastDeltaByItemId: state.lastAgentMessageDeltaByItemId,
            buffers: state.agentMessageBuffers,
        })
    ) {
        return EMPTY_EVENTS
    }
    return [withTurnId({ type: 'agent_message_delta', item_id: itemId, delta }, turnId)]
}

function handlePlanDelta(state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const itemId = extractItemId(params)
    const turnId = extractTurnId(params)
    const delta = asString(params.delta ?? params.text ?? params.message)
    if (itemId) {
        state.planTurnIds.set(itemId, turnId)
    }
    if (
        !appendUniqueBufferedDelta({
            itemId,
            delta,
            lastDeltaByItemId: state.lastPlanDeltaByItemId,
            buffers: state.planBuffers,
        })
    ) {
        return EMPTY_EVENTS
    }
    return EMPTY_EVENTS
}

function handleReasoningDelta(state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const itemId = extractItemId(params) ?? DEFAULT_REASONING_ITEM_ID
    const turnId = extractTurnId(params)
    const delta = asString(params.delta ?? params.text ?? params.message)
    if (
        !appendUniqueBufferedDelta({
            itemId,
            delta,
            lastDeltaByItemId: state.lastReasoningDeltaByItemId,
            buffers: state.reasoningBuffers,
        })
    ) {
        return EMPTY_EVENTS
    }
    return [withTurnId({ type: 'agent_reasoning_delta', delta }, turnId)]
}

function handleReasoningSectionBreak(state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const itemId = extractItemId(params) ?? DEFAULT_REASONING_ITEM_ID
    const turnId = extractTurnId(params)
    const summaryIndex = asNumber(params.summaryIndex ?? params.summary_index)
    if (summaryIndex !== null) {
        const key = `${itemId}:${summaryIndex}`
        if (state.reasoningSectionBreakKeys.has(key)) {
            return EMPTY_EVENTS
        }
        state.reasoningSectionBreakKeys.add(key)
    }
    return [withTurnId({ type: 'agent_reasoning_section_break' }, turnId)]
}

function handleCommandOutputDelta(state: AppServerEventState, params: Record<string, unknown>): ConvertedEvent[] {
    const itemId = extractItemId(params)
    const delta = asString(params.delta ?? params.text ?? params.output ?? params.stdout)
    appendUniqueBufferedDelta({
        itemId,
        delta,
        lastDeltaByItemId: state.lastCommandOutputDeltaByItemId,
        buffers: state.commandOutputBuffers,
    })
    return EMPTY_EVENTS
}

const DIRECT_NOTIFICATION_HANDLERS: Record<string, NotificationHandler> = {
    'thread/started': handleThreadStarted,
    'thread/resumed': handleThreadStarted,
    'thread/compacted': handleThreadStarted,
    'turn/started': handleTurnStarted,
    'turn/completed': handleTurnCompleted,
    'turn/diff/updated': handleTurnDiff,
    'turn/plan/updated': handleTurnPlanUpdated,
    'thread/tokenUsage/updated': handleTokenUsage,
    error: handleError,
    'item/agentMessage/delta': handleAgentMessageDelta,
    'item/plan/delta': handlePlanDelta,
    'item/reasoning/textDelta': handleReasoningDelta,
    'item/reasoning/summaryTextDelta': handleReasoningDelta,
    'item/reasoning/summaryPartAdded': handleReasoningSectionBreak,
    'item/commandExecution/outputDelta': handleCommandOutputDelta,
    'item/started': (state, params) => handleItemLifecycle(state, 'item/started', params),
    'item/completed': (state, params) => handleItemLifecycle(state, 'item/completed', params),
}

export function handleDirectNotification(
    state: AppServerEventState,
    method: string,
    params: Record<string, unknown>
): ConvertedEvent[] | null {
    if (IGNORED_NOTIFICATION_METHODS.has(method)) {
        return EMPTY_EVENTS
    }
    const handler = DIRECT_NOTIFICATION_HANDLERS[method]
    return handler ? handler(state, params) : null
}
