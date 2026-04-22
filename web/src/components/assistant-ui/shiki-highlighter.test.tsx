import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SyntaxHighlighter } from '@/components/assistant-ui/shiki-highlighter'

vi.mock('@/components/code-block/CodeSurface', () => ({
    CodeSurface: (props: { children: React.ReactNode; className?: string; preClassName?: string }) => (
        <div
            data-testid="code-surface"
            data-class-name={props.className ?? ''}
            data-pre-class-name={props.preClassName ?? ''}
        >
            {props.children}
        </div>
    ),
}))

vi.mock('@/components/code-block/CodeContent', () => ({
    CodeContent: (props: { code: string; language?: string; highlight?: string }) => (
        <div data-testid="code-content" data-language={props.language ?? ''} data-highlight={props.highlight ?? ''}>
            {props.code}
        </div>
    ),
}))

describe('SyntaxHighlighter', () => {
    it('reuses the shared code surface owner for assistant markdown code blocks', () => {
        render(<SyntaxHighlighter code={'const value = 1'} language="ts" components={{} as never} />)

        expect(screen.getByTestId('code-surface')).toHaveAttribute(
            'data-class-name',
            'aui-md-codeblock rounded-b-md rounded-t-none'
        )
        expect(screen.getByTestId('code-surface')).toHaveAttribute('data-pre-class-name', 'p-2 text-sm')
        expect(screen.getByTestId('code-content')).toHaveAttribute('data-language', 'ts')
        expect(screen.getByTestId('code-content')).toHaveAttribute('data-highlight', 'auto')
        expect(screen.getByTestId('code-content')).toHaveTextContent('const value = 1')
    })
})
