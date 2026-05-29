import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

vi.mock('@/components/markdown/MarkdownPrimitive', () => ({
    MarkdownPrimitive: (props: { className?: string; codeHighlight?: string; content: string }) => (
        <div
            data-testid="markdown-primitive"
            data-class={props.className}
            data-code-highlight={props.codeHighlight}
            data-content={props.content}
        />
    ),
}))

describe('MarkdownRenderer', () => {
    it('routes external markdown text through the shared markdown primitive owner', () => {
        render(<MarkdownRenderer content="**shared markdown**" />)

        expect(screen.getByTestId('markdown-primitive')).toHaveAttribute('data-content', '**shared markdown**')
        expect(screen.getByTestId('markdown-primitive')).toHaveAttribute('data-code-highlight', 'never')
    })
})
