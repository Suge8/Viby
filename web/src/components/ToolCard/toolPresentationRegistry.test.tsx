import { describe, expect, it } from 'vitest'
import { toolPresentationRegistry } from './toolPresentationRegistry'
import type { ToolOpts } from './toolPresentationTypes'

function createToolOpts(input: unknown): ToolOpts {
    return {
        toolName: 'Task',
        input,
        result: null,
        metadata: null,
        description: null,
        childrenCount: 0,
    }
}

describe('toolPresentationRegistry', () => {
    it('prefers the task name over legacy description fields', () => {
        expect(
            toolPresentationRegistry.Task.title?.(
                createToolOpts({ name: 'alpha-worker', description: 'legacy description' })
            )
        ).toBe('Agent: alpha-worker')
    })

    it('falls back to the description when the task name is absent', () => {
        expect(toolPresentationRegistry.Task.title?.(createToolOpts({ description: 'Investigate regression' }))).toBe(
            'Investigate regression'
        )
    })
})
