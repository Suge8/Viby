import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { I18nProvider } from '@/lib/i18n-context'
import { NoticeProvider } from '@/lib/notice-center'
import { CodeBlock } from './CodeBlock'

vi.mock('@/hooks/useCopyToClipboard', () => ({
    useCopyToClipboard: () => ({
        copied: false,
        copy: vi.fn(async () => true),
    }),
}))

vi.mock('@/components/code-block/ShikiCodeContent', () => ({
    default: (props: { code: string; language?: string }) => (
        <code data-testid="shiki-code-content" data-language={props.language}>
            {props.code}
        </code>
    ),
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
}))

function renderCodeBlock(props: ComponentProps<typeof CodeBlock>) {
    return render(
        <I18nProvider>
            <NoticeProvider>
                <CodeBlock {...props} />
                <FloatingNoticeViewport />
            </NoticeProvider>
        </I18nProvider>
    )
}

describe('CodeBlock', () => {
    it('keeps plain-text and json content on the non-Shiki path by default', () => {
        renderCodeBlock({
            code: '{"ok":true}',
            language: 'json',
        })

        expect(screen.getByText('{"ok":true}')).toBeInTheDocument()
        expect(screen.queryByTestId('shiki-code-content')).not.toBeInTheDocument()
    })

    it('lazy-loads the Shiki renderer for highlightable languages', async () => {
        renderCodeBlock({
            code: 'diff --git a/file b/file',
            language: 'diff',
        })

        const shikiContent = await screen.findByTestId('shiki-code-content')
        expect(shikiContent).toHaveAttribute('data-language', 'diff')
        expect(shikiContent).toHaveTextContent('diff --git a/file b/file')
    })

    it('keeps very large code blocks on the plain path even for highlightable languages', () => {
        const hugeDiff = Array.from({ length: 400 }, (_, index) => `+ line ${index}`).join('\n')
        const { container } = renderCodeBlock({
            code: hugeDiff,
            language: 'diff',
        })

        expect(container).toHaveTextContent('+ line 0')
        expect(container.querySelector('[data-testid="shiki-code-content"]')).toBeNull()
    })

    it('keeps long-tail languages on the plain auto-highlight path', () => {
        const { container } = renderCodeBlock({
            code: 'public class Example {}',
            language: 'csharp',
        })

        expect(screen.getByText('public class Example {}')).toBeInTheDocument()
        expect(container.querySelector('[data-testid="shiki-code-content"]')).toBeNull()
    })

    it('keeps unsupported languages on the plain path even when highlight is forced', () => {
        const { container } = renderCodeBlock({
            code: 'public class Example {}',
            language: 'csharp',
            highlight: 'always',
        })

        expect(container).toHaveTextContent('public class Example {}')
        expect(container.querySelector('[data-testid="shiki-code-content"]')).toBeNull()
    })

    it('hides the copy action when showCopyButton is disabled', () => {
        const { container } = renderCodeBlock({
            code: 'const x = 1',
            language: 'ts',
            showCopyButton: false,
        })

        expect(container.querySelector('button')).toBeNull()
    })
})
