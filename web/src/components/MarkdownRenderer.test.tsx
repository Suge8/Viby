import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

vi.mock('@assistant-ui/react', () => ({
    TextMessagePartProvider: (props: { text: string; children: React.ReactNode }) => (
        <div data-testid="text-message-part-provider" data-text={props.text}>
            {props.children}
        </div>
    )
}))

vi.mock('@/components/markdown/MarkdownPrimitive', () => ({
    MarkdownPrimitive: (props: { className?: string }) => <div data-testid="markdown-primitive" data-class={props.className} />
}))

describe('MarkdownRenderer', () => {
    it('routes external markdown text through the shared markdown primitive owner', () => {
        render(<MarkdownRenderer content="**shared markdown**" />)

        expect(screen.getByTestId('text-message-part-provider')).toHaveAttribute('data-text', '**shared markdown**')
        expect(screen.getByTestId('markdown-primitive')).toBeInTheDocument()
    })
})
