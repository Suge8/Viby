export type ConvertedEvent = {
    type: string
    [key: string]: unknown
}

export type AppServerEventState = {
    agentMessageBuffers: Map<string, string>
    planBuffers: Map<string, string>
    reasoningBuffers: Map<string, string>
    commandOutputBuffers: Map<string, string>
    planTurnIds: Map<string, string | null>
    commandMeta: Map<string, Record<string, unknown>>
    fileChangeMeta: Map<string, Record<string, unknown>>
    completedAgentMessageItems: Set<string>
    completedPlanItems: Set<string>
    completedReasoningItems: Set<string>
    reasoningSectionBreakKeys: Set<string>
    lastAgentMessageDeltaByItemId: Map<string, string>
    lastPlanDeltaByItemId: Map<string, string>
    lastReasoningDeltaByItemId: Map<string, string>
    lastCommandOutputDeltaByItemId: Map<string, string>
}

export function createAppServerEventState(): AppServerEventState {
    return {
        agentMessageBuffers: new Map<string, string>(),
        planBuffers: new Map<string, string>(),
        reasoningBuffers: new Map<string, string>(),
        commandOutputBuffers: new Map<string, string>(),
        planTurnIds: new Map<string, string | null>(),
        commandMeta: new Map<string, Record<string, unknown>>(),
        fileChangeMeta: new Map<string, Record<string, unknown>>(),
        completedAgentMessageItems: new Set<string>(),
        completedPlanItems: new Set<string>(),
        completedReasoningItems: new Set<string>(),
        reasoningSectionBreakKeys: new Set<string>(),
        lastAgentMessageDeltaByItemId: new Map<string, string>(),
        lastPlanDeltaByItemId: new Map<string, string>(),
        lastReasoningDeltaByItemId: new Map<string, string>(),
        lastCommandOutputDeltaByItemId: new Map<string, string>(),
    }
}

export function resetAppServerEventState(state: AppServerEventState): void {
    state.agentMessageBuffers.clear()
    state.planBuffers.clear()
    state.reasoningBuffers.clear()
    state.commandOutputBuffers.clear()
    state.planTurnIds.clear()
    state.commandMeta.clear()
    state.fileChangeMeta.clear()
    state.completedAgentMessageItems.clear()
    state.completedPlanItems.clear()
    state.completedReasoningItems.clear()
    state.reasoningSectionBreakKeys.clear()
    state.lastAgentMessageDeltaByItemId.clear()
    state.lastPlanDeltaByItemId.clear()
    state.lastReasoningDeltaByItemId.clear()
    state.lastCommandOutputDeltaByItemId.clear()
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

export function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

export function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null
}

export function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function withTurnId(event: ConvertedEvent, turnId: string | null): ConvertedEvent {
    return turnId ? { ...event, turn_id: turnId } : event
}

export function extractItemId(params: Record<string, unknown>): string | null {
    const direct = asString(params.itemId ?? params.item_id ?? params.id)
    if (direct) {
        return direct
    }
    const item = asRecord(params.item)
    return item ? asString(item.id ?? item.itemId ?? item.item_id) : null
}

export function extractTurnId(params: Record<string, unknown>): string | null {
    const direct = asString(params.turnId ?? params.turn_id)
    if (direct) {
        return direct
    }
    const item = asRecord(params.item)
    return item ? asString(item.turnId ?? item.turn_id ?? asRecord(item.turn)?.id) : null
}

export function extractThreadId(params: Record<string, unknown>): string | null {
    const direct = asString(params.threadId ?? params.thread_id ?? params.id)
    if (direct) {
        return direct
    }
    const thread = asRecord(params.thread)
    return thread ? asString(thread.threadId ?? thread.thread_id ?? thread.id) : null
}

export function extractItem(params: Record<string, unknown>): Record<string, unknown> | null {
    return asRecord(params.item) ?? params
}

export function normalizeItemType(value: unknown): string | null {
    const raw = asString(value)
    return raw ? raw.toLowerCase().replace(/[\s_-]/g, '') : null
}

export function extractCommand(value: unknown): string | null {
    if (typeof value === 'string') {
        return value
    }
    if (!Array.isArray(value)) {
        return null
    }
    const parts = value.filter((part): part is string => typeof part === 'string')
    return parts.length > 0 ? parts.join(' ') : null
}

export function extractChanges(value: unknown): Record<string, unknown> | null {
    const record = asRecord(value)
    if (record) {
        return record
    }
    if (!Array.isArray(value)) {
        return null
    }

    const changes: Record<string, unknown> = {}
    for (const entry of value) {
        const entryRecord = asRecord(entry)
        if (!entryRecord) {
            continue
        }
        const path = asString(entryRecord.path ?? entryRecord.file ?? entryRecord.filePath ?? entryRecord.file_path)
        if (path) {
            changes[path] = entryRecord
        }
    }
    return Object.keys(changes).length > 0 ? changes : null
}

export function extractTextFromContent(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) {
        return value
    }
    if (!Array.isArray(value)) {
        return null
    }
    const chunks: string[] = []
    for (const entry of value) {
        const record = asRecord(entry)
        if (!record) {
            continue
        }
        const text = asString(record.text ?? record.message ?? record.content)
        if (text) {
            chunks.push(text)
        }
    }
    return chunks.length > 0 ? chunks.join('') : null
}

export function extractItemText(item: Record<string, unknown>): string | null {
    return asString(item.text ?? item.message) ?? extractTextFromContent(item.content)
}

export function extractReasoningText(item: Record<string, unknown>): string | null {
    const direct = extractItemText(item)
    if (direct) {
        return direct
    }
    const summary = item.summary_text ?? item.summaryText
    if (!Array.isArray(summary)) {
        return null
    }
    const chunks = summary.filter((part): part is string => typeof part === 'string' && part.length > 0)
    return chunks.length > 0 ? chunks.join('\n') : null
}
