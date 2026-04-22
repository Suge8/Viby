import { addMetaValue, consumeCompletedTextItem, resolveLifecycleItem } from './appServerEventConverterItemSupport'
import {
    type AppServerEventState,
    asBoolean,
    asNumber,
    asString,
    type ConvertedEvent,
    extractChanges,
    extractCommand,
    extractItemText,
    extractReasoningText,
    withTurnId,
} from './appServerEventParser'

const EMPTY_EVENTS: ConvertedEvent[] = []

function handleAgentMessageItem(
    state: AppServerEventState,
    method: 'item/started' | 'item/completed',
    itemId: string,
    item: Record<string, unknown>,
    turnId: string | null
): ConvertedEvent[] {
    const text = consumeCompletedTextItem({
        method,
        itemId,
        item,
        completedItems: state.completedAgentMessageItems,
        buffers: state.agentMessageBuffers,
        lastDeltaByItemId: state.lastAgentMessageDeltaByItemId,
        resolveText: extractItemText,
    })
    if (!text) {
        return EMPTY_EVENTS
    }
    return [withTurnId({ type: 'agent_message', item_id: itemId, message: text }, turnId)]
}

function handleReasoningItem(
    state: AppServerEventState,
    method: 'item/started' | 'item/completed',
    itemId: string,
    item: Record<string, unknown>,
    turnId: string | null
): ConvertedEvent[] {
    const text = consumeCompletedTextItem({
        method,
        itemId,
        item,
        completedItems: state.completedReasoningItems,
        buffers: state.reasoningBuffers,
        lastDeltaByItemId: state.lastReasoningDeltaByItemId,
        resolveText: extractReasoningText,
    })
    if (!text) {
        return EMPTY_EVENTS
    }
    return [withTurnId({ type: 'agent_reasoning', text }, turnId)]
}

function handlePlanItem(
    state: AppServerEventState,
    method: 'item/started' | 'item/completed',
    itemId: string,
    item: Record<string, unknown>,
    turnId: string | null
): ConvertedEvent[] {
    const text = consumeCompletedTextItem({
        method,
        itemId,
        item,
        completedItems: state.completedPlanItems,
        buffers: state.planBuffers,
        lastDeltaByItemId: state.lastPlanDeltaByItemId,
        resolveText: extractItemText,
    })
    if (!text) {
        return EMPTY_EVENTS
    }

    state.planTurnIds.delete(itemId)
    return [withTurnId({ type: 'plan_proposal', item_id: itemId, message: text }, turnId)]
}

function handleCommandExecutionItem(
    state: AppServerEventState,
    method: 'item/started' | 'item/completed',
    itemId: string,
    item: Record<string, unknown>
): ConvertedEvent[] {
    if (method === 'item/started') {
        const command = extractCommand(item.command ?? item.cmd ?? item.args)
        const cwd = asString(item.cwd ?? item.workingDirectory ?? item.working_directory)
        const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved)
        const meta: Record<string, unknown> = {}
        addMetaValue(meta, 'command', command)
        addMetaValue(meta, 'cwd', cwd)
        addMetaValue(meta, 'auto_approved', autoApproved)
        state.commandMeta.set(itemId, meta)
        return [{ type: 'exec_command_begin', call_id: itemId, ...meta }]
    }

    const meta = state.commandMeta.get(itemId) ?? {}
    const output = asString(item.output ?? item.result ?? item.stdout) ?? state.commandOutputBuffers.get(itemId)
    const stderr = asString(item.stderr)
    const error = asString(item.error)
    const exitCode = asNumber(item.exitCode ?? item.exit_code ?? item.exitcode)
    const status = asString(item.status)

    state.commandMeta.delete(itemId)
    state.commandOutputBuffers.delete(itemId)
    state.lastCommandOutputDeltaByItemId.delete(itemId)

    return [
        {
            type: 'exec_command_end',
            call_id: itemId,
            ...meta,
            ...(output ? { output } : {}),
            ...(stderr ? { stderr } : {}),
            ...(error ? { error } : {}),
            ...(exitCode !== null ? { exit_code: exitCode } : {}),
            ...(status ? { status } : {}),
        },
    ]
}

function handleFileChangeItem(
    state: AppServerEventState,
    method: 'item/started' | 'item/completed',
    itemId: string,
    item: Record<string, unknown>
): ConvertedEvent[] {
    if (method === 'item/started') {
        const changes = extractChanges(item.changes ?? item.change ?? item.diff)
        const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved)
        const meta: Record<string, unknown> = {}
        addMetaValue(meta, 'changes', changes)
        addMetaValue(meta, 'auto_approved', autoApproved)
        state.fileChangeMeta.set(itemId, meta)
        return [{ type: 'patch_apply_begin', call_id: itemId, ...meta }]
    }

    const meta = state.fileChangeMeta.get(itemId) ?? {}
    state.fileChangeMeta.delete(itemId)
    return [
        {
            type: 'patch_apply_end',
            call_id: itemId,
            ...meta,
            ...(asString(item.stdout ?? item.output) ? { stdout: asString(item.stdout ?? item.output) } : {}),
            ...(asString(item.stderr) ? { stderr: asString(item.stderr) } : {}),
            success: asBoolean(item.success ?? item.ok ?? item.applied ?? item.status === 'completed') ?? false,
        },
    ]
}

export function handleItemLifecycle(
    state: AppServerEventState,
    method: 'item/started' | 'item/completed',
    params: Record<string, unknown>
): ConvertedEvent[] {
    const lifecycleItem = resolveLifecycleItem(params)
    if (!lifecycleItem) {
        return EMPTY_EVENTS
    }
    const { item, itemId, itemType, turnId } = lifecycleItem

    switch (itemType) {
        case 'agentmessage':
            return handleAgentMessageItem(state, method, itemId, item, turnId)
        case 'reasoning':
            return handleReasoningItem(state, method, itemId, item, turnId)
        case 'plan':
            return handlePlanItem(state, method, itemId, item, turnId)
        case 'commandexecution':
            return handleCommandExecutionItem(state, method, itemId, item)
        case 'filechange':
            return handleFileChangeItem(state, method, itemId, item)
        default:
            return EMPTY_EVENTS
    }
}
