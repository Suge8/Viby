import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VibyChatProvider } from '@/components/AssistantChat/context'
import { I18nProvider } from '@/lib/i18n-context'
import { encodeBase64 } from '@/lib/utils'
import { MarkdownPrimitive } from './MarkdownPrimitive'

function renderMarkdown(content: string) {
    return render(
        <I18nProvider>
            <VibyChatProvider
                value={{
                    api: {} as never,
                    sessionId: 'session-1',
                    metadata: null,
                    disabled: false,
                    onRefresh: () => undefined,
                }}
            >
                <MarkdownPrimitive content={content} />
            </VibyChatProvider>
        </I18nProvider>
    )
}

describe('MarkdownPrimitive session file links', () => {
    it('links explicit transcript file paths to the current session file page', async () => {
        renderMarkdown('Open /repo/src/App.tsx:12')

        const link = await screen.findByRole('link', { name: '/repo/src/App.tsx:12' })
        expect(link).toHaveAttribute(
            'href',
            `/sessions/session-1/file?path=${encodeURIComponent(encodeBase64('/repo/src/App.tsx'))}&tab=directories`
        )
    })

    it('keeps custom app URI schemes inert', async () => {
        renderMarkdown('[Open app](vscode://file/project)')

        expect(await screen.findByText('Open app')).not.toHaveAttribute('href')
    })
})
