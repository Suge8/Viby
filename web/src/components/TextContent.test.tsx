import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextContent } from '@/components/TextContent'

const loadMarkdownHarness = vi.hoisted(() => ({
    getLoadedMarkdownRendererModule: vi.fn<() => unknown>(() => null),
}))

vi.mock('@/components/MarkdownRenderer', () => ({
    MarkdownRenderer: (props: { content: string }) => <div data-testid="markdown-renderer">{props.content}</div>,
}))

vi.mock('@/components/markdown/loadMarkdownRenderer', () => ({
    getLoadedMarkdownRendererModule: loadMarkdownHarness.getLoadedMarkdownRendererModule,
}))

afterEach(() => {
    cleanup()
    loadMarkdownHarness.getLoadedMarkdownRendererModule.mockReset()
    loadMarkdownHarness.getLoadedMarkdownRendererModule.mockReturnValue(null)
})

describe('TextContent', () => {
    it('keeps plain text on the lightweight path when mode is plain', () => {
        render(<TextContent text="plain user message" mode="plain" />)

        expect(screen.getByText('plain user message')).toBeInTheDocument()
        expect(screen.queryByTestId('markdown-renderer')).toBeNull()
    })

    it('loads markdown rendering when auto mode detects markdown', async () => {
        render(<TextContent text={'```ts\nconst x = 1\n```'} />)

        expect(await screen.findByTestId('markdown-renderer')).toHaveTextContent(/const x = 1/)
    })

    it('can force markdown rendering explicitly', async () => {
        render(<TextContent text="plain but markdown" mode="markdown" />)

        expect(await screen.findByTestId('markdown-renderer')).toHaveTextContent('plain but markdown')
    })

    it('reuses the preloaded markdown renderer without suspending back to plain text', () => {
        loadMarkdownHarness.getLoadedMarkdownRendererModule.mockReturnValue({
            MarkdownRenderer: (props: { content: string }) => (
                <div data-testid="markdown-renderer">{props.content}</div>
            ),
        })

        render(<TextContent text="**preloaded**" mode="markdown" />)

        expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('**preloaded**')
    })

    it('keeps hook order stable when switching between plain and auto markdown modes', async () => {
        const { rerender } = render(<TextContent text="plain user message" mode="plain" />)

        expect(screen.queryByTestId('markdown-renderer')).toBeNull()

        rerender(<TextContent text={'```ts\nconst x = 1\n```'} />)

        expect(await screen.findByTestId('markdown-renderer')).toHaveTextContent(/const x = 1/)
    })
})
