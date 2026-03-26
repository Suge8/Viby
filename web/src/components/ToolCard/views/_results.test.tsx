import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToolResultViewComponent } from '@/components/ToolCard/views/_results'
import type { ToolCallBlock } from '@/chat/types'

const textContentMock = vi.fn((props: { text: string; mode?: string }) => (
    <div data-testid="text-content" data-mode={props.mode ?? 'auto'}>
        {props.text}
    </div>
))

vi.mock('@/components/TextContent', () => ({
    TextContent: (props: { text: string; mode?: string }) => textContentMock(props),
}))

vi.mock('@/components/CodeBlock', () => ({
    CodeBlock: (props: { code: string }) => <pre data-testid="code-block">{props.code}</pre>,
}))

afterEach(() => {
    cleanup()
})

function createBlock(toolName: string, result: unknown): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `${toolName}-1`,
        localId: null,
        createdAt: 1_000,
        children: [],
        tool: {
            id: `${toolName}-1`,
            name: toolName,
            state: 'completed',
            input: null,
            createdAt: 1_000,
            startedAt: null,
            completedAt: 1_001,
            description: null,
            result,
        },
    }
}

describe('tool result render modes', () => {
    it('keeps generic text results on the plain path', () => {
        textContentMock.mockClear()
        const View = getToolResultViewComponent('UnknownTool')

        render(<View block={createBlock('UnknownTool', '# should stay plain')} metadata={null} />)

        expect(screen.getByTestId('text-content')).toHaveAttribute('data-mode', 'plain')
    })

    it('keeps markdown-only tools on the markdown path explicitly', () => {
        textContentMock.mockClear()
        const View = getToolResultViewComponent('Task')

        render(<View block={createBlock('Task', '# heading')} metadata={null} />)

        expect(screen.getByTestId('text-content')).toHaveAttribute('data-mode', 'markdown')
    })
})
