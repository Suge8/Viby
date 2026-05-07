import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@/chat/types'
import { buildToolTraceItems } from '@/components/ToolCard/trace'

function toolBlock(id: string, children: ToolCallBlock[] = []): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1_000,
        children,
        tool: {
            id,
            name: id,
            input: { command: id },
            description: `Run ${id}`,
            state: 'completed',
            createdAt: 1_000,
            startedAt: 1_000,
            completedAt: 1_100,
            result: null,
        },
    }
}

describe('buildToolTraceItems', () => {
    it('flattens nested task child blocks without duplicating transcript ownership', () => {
        const trace = buildToolTraceItems({
            ...toolBlock('Task'),
            children: [
                toolBlock('Read'),
                {
                    ...toolBlock('Nested'),
                    children: [toolBlock('Write')],
                },
            ],
        })

        expect(trace.map((item) => [item.label, item.depth, item.state])).toEqual([
            ['Read', 0, 'completed'],
            ['Nested', 0, 'completed'],
            ['Write', 1, 'completed'],
        ])
    })
})
