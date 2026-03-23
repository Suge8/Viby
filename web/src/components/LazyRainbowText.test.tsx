import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LazyRainbowText } from '@/components/LazyRainbowText'

vi.mock('@/components/MarkdownRenderer', () => ({
    MarkdownRenderer: (props: { content: string }) => (
        <div data-testid="markdown-renderer">{props.content}</div>
    )
}))

describe('LazyRainbowText', () => {
    it('keeps plain user text on the lightweight non-markdown path', () => {
        render(<LazyRainbowText text="plain user message" />)

        expect(screen.getByText('plain user message')).toBeInTheDocument()
        expect(screen.queryByTestId('markdown-renderer')).toBeNull()
    })

    it('loads markdown rendering only when the text looks like markdown', async () => {
        render(<LazyRainbowText text={'```ts\nconst x = 1\n```'} />)

        expect(await screen.findByTestId('markdown-renderer')).toHaveTextContent(/const x = 1/)
    })
})
