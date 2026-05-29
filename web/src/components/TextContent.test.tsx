import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextContent } from '@/components/TextContent'

vi.mock('@/components/MarkdownRenderer', () => ({
    MarkdownRenderer: (props: { content: string }) => <div data-testid="markdown-renderer">{props.content}</div>,
}))

afterEach(() => {
    cleanup()
})

describe('TextContent', () => {
    it('keeps plain text on the lightweight path when mode is plain', () => {
        render(<TextContent text="plain user message" mode="plain" />)

        expect(screen.getByText('plain user message')).toBeInTheDocument()
        expect(screen.queryByTestId('markdown-renderer')).toBeNull()
    })

    it('renders markdown synchronously when auto mode detects markdown', () => {
        render(<TextContent text={'```ts\nconst x = 1\n```'} />)

        expect(screen.getByTestId('markdown-renderer')).toHaveTextContent(/const x = 1/)
    })

    it('can force markdown rendering explicitly', () => {
        render(<TextContent text="plain but markdown" mode="markdown" />)

        expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('plain but markdown')
    })

    it('keeps hook order stable when switching between plain and auto markdown modes', () => {
        const { rerender } = render(<TextContent text="plain user message" mode="plain" />)

        expect(screen.queryByTestId('markdown-renderer')).toBeNull()

        rerender(<TextContent text={'```ts\nconst x = 1\n```'} />)

        expect(screen.getByTestId('markdown-renderer')).toHaveTextContent(/const x = 1/)
    })
})
