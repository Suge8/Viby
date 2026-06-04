import { asString, extractItem, extractItemId, extractTurnId, normalizeItemType } from './appServerEventParser'

export function appendUniqueBufferedDelta(options: {
    itemId: string | null
    delta: string | null
    lastDeltaByItemId: Map<string, string>
    buffers: Map<string, string>
}): boolean {
    const { itemId, delta, lastDeltaByItemId, buffers } = options
    if (!itemId || !delta || lastDeltaByItemId.get(itemId) === delta) {
        return false
    }

    lastDeltaByItemId.set(itemId, delta)
    buffers.set(itemId, `${buffers.get(itemId) ?? ''}${delta}`)
    return true
}

export function consumeCompletedTextItem(options: {
    method: 'item/started' | 'item/completed'
    itemId: string
    item: Record<string, unknown>
    completedItems: Set<string>
    buffers: Map<string, string>
    lastDeltaByItemId: Map<string, string>
    resolveText: (item: Record<string, unknown>) => string | null
}): string | null {
    const { method, itemId, item, completedItems, buffers, lastDeltaByItemId, resolveText } = options
    if (method !== 'item/completed' || completedItems.has(itemId)) {
        return null
    }

    const text = resolveText(item) ?? buffers.get(itemId)
    if (!text) {
        return null
    }

    completedItems.add(itemId)
    buffers.delete(itemId)
    lastDeltaByItemId.delete(itemId)
    return text
}

export function addMetaValue(meta: Record<string, unknown>, key: string, value: unknown): void {
    if (value === null || value === undefined) {
        return
    }
    if (typeof value === 'string' && value.length === 0) {
        return
    }
    meta[key] = value
}

export function resolveLifecycleItem(params: Record<string, unknown>): {
    item: Record<string, unknown>
    itemType: string
    itemId: string
    turnId: string | null
} | null {
    const item = extractItem(params)
    if (!item) {
        return null
    }

    const itemType = normalizeItemType(item.type ?? item.itemType ?? item.kind)
    const itemId = extractItemId(params) ?? asString(item.id ?? item.itemId ?? item.item_id)
    if (!itemType || !itemId) {
        return null
    }

    return {
        item,
        itemType,
        itemId,
        turnId: extractTurnId(params),
    }
}
