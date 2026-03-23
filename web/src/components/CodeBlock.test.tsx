import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { CodeBlock } from './CodeBlock'

vi.mock('@/hooks/useCopyToClipboard', () => ({
    useCopyToClipboard: () => ({
        copied: false,
        copy: vi.fn(async () => true)
    })
}))

vi.mock('@/components/code-block/ShikiCodeContent', () => ({
    default: (props: { code: string; language?: string }) => (
        <code data-testid="shiki-code-content" data-language={props.language}>
            {props.code}
        </code>
    )
}))

function renderCodeBlock(props: ComponentProps<typeof CodeBlock>) {
    return render(
        <I18nProvider>
            <CodeBlock {...props} />
        </I18nProvider>
    )
}

describe('CodeBlock', () => {
    it('keeps plain-text and json content on the non-Shiki path by default', () => {
        renderCodeBlock({
            code: '{"ok":true}',
            language: 'json'
        })

        expect(screen.getByText('{"ok":true}')).toBeInTheDocument()
        expect(screen.queryByTestId('shiki-code-content')).not.toBeInTheDocument()
    })

    it('lazy-loads the Shiki renderer for highlightable languages', async () => {
        renderCodeBlock({
            code: 'diff --git a/file b/file',
            language: 'diff'
        })

        const shikiContent = await screen.findByTestId('shiki-code-content')
        expect(shikiContent).toHaveAttribute('data-language', 'diff')
        expect(shikiContent).toHaveTextContent('diff --git a/file b/file')
    })
})
