import { describe, expect, it } from 'vitest'
import {
    appendUniqueBufferedDelta,
    consumeCompletedTextItem,
    resolveLifecycleItem,
} from './appServerEventConverterItemSupport'

describe('appServerEventConverterItemSupport', () => {
    it('deduplicates buffered deltas per item', () => {
        const buffers = new Map<string, string>()
        const lastDeltaByItemId = new Map<string, string>()

        expect(
            appendUniqueBufferedDelta({
                itemId: 'item-1',
                delta: 'hello',
                lastDeltaByItemId,
                buffers,
            })
        ).toBe(true)
        expect(
            appendUniqueBufferedDelta({
                itemId: 'item-1',
                delta: 'hello',
                lastDeltaByItemId,
                buffers,
            })
        ).toBe(false)
        expect(buffers.get('item-1')).toBe('hello')
    })

    it('consumes completed buffered items exactly once', () => {
        const completedItems = new Set<string>()
        const buffers = new Map([['item-1', 'hello world']])
        const lastDeltaByItemId = new Map([['item-1', 'world']])

        expect(
            consumeCompletedTextItem({
                method: 'item/completed',
                itemId: 'item-1',
                item: {},
                completedItems,
                buffers,
                lastDeltaByItemId,
                resolveText: () => null,
            })
        ).toBe('hello world')
        expect(
            consumeCompletedTextItem({
                method: 'item/completed',
                itemId: 'item-1',
                item: {},
                completedItems,
                buffers,
                lastDeltaByItemId,
                resolveText: () => null,
            })
        ).toBeNull()
    })

    it('resolves lifecycle items from canonical params', () => {
        expect(
            resolveLifecycleItem({
                turnId: 'turn-1',
                item: { id: 'item-1', type: 'agentMessage' },
            })
        ).toEqual({
            item: { id: 'item-1', type: 'agentMessage' },
            itemId: 'item-1',
            itemType: 'agentmessage',
            turnId: 'turn-1',
        })
    })
})
