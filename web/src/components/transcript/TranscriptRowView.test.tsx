import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TranscriptRow } from '@/chat/transcriptTypes'
import { VibyChatProvider } from '@/components/AssistantChat/context'
import { preloadMarkdownRenderer } from '@/components/markdown/loadMarkdownRenderer'
import { TranscriptRowView } from '@/components/transcript/TranscriptRowView'
import { I18nProvider } from '@/lib/i18n-context'
import { preloadTranslations } from '@/lib/i18nCatalog'
import { NoticeProvider } from '@/lib/notice-center'

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
            selection: vi.fn(),
        },
    }),
}))

function renderRow(row: TranscriptRow) {
    return render(
        <NoticeProvider>
            <I18nProvider>
                <VibyChatProvider
                    value={{
                        api: null as never,
                        sessionId: 'session-1',
                        metadata: null,
                        disabled: false,
                        onRefresh: vi.fn(),
                        onRetryMessage: vi.fn(),
                    }}
                >
                    <TranscriptRowView row={row} />
                </VibyChatProvider>
            </I18nProvider>
        </NoticeProvider>
    )
}

describe('TranscriptRowView', () => {
    it('renders markdown assistant rows without ThreadPrimitive message context', async () => {
        await preloadMarkdownRenderer()

        renderRow({
            id: 'assistant:1',
            type: 'assistant-text',
            conversationId: 'assistant:1',
            depth: 0,
            copyText: '# heading',
            block: {
                kind: 'agent-text',
                id: '1',
                localId: null,
                createdAt: 1,
                text: '# heading',
                renderMode: 'markdown',
            },
        })

        expect(await screen.findByText('heading')).toBeInTheDocument()
    })

    it('marks markdown image-only assistant rows as media-only surfaces', async () => {
        await preloadMarkdownRenderer()

        const { container } = renderRow({
            id: 'assistant:image',
            type: 'assistant-text',
            conversationId: 'assistant:image',
            depth: 0,
            copyText: '![cat](https://example.com/cat.png)',
            block: {
                kind: 'agent-text',
                id: 'image',
                localId: null,
                createdAt: 1,
                text: '![cat](https://example.com/cat.png)',
                renderMode: 'markdown',
            },
        })

        expect(container.querySelector('.ds-message-surface')).toHaveAttribute('data-content-layout', 'media-only')
    })

    it('renders event notices with collapsed diagnostic details', async () => {
        await preloadTranslations('en')

        renderRow({
            id: 'event:assistant-error',
            type: 'event',
            conversationId: 'event:assistant-error',
            depth: 0,
            copyText: null,
            block: {
                kind: 'agent-event',
                id: 'assistant-error',
                createdAt: 1,
                event: { type: 'assistant-error', detail: 'WebSocket closed with code 1006' },
            },
        })

        expect(screen.getByText('AI reply did not complete. Send again to retry.')).toBeInTheDocument()
        expect(screen.getByText('Details')).toBeInTheDocument()
        expect(screen.getByText('WebSocket closed with code 1006')).toBeInTheDocument()
    })

    it('renders reasoning chip centered with translated label', async () => {
        await preloadTranslations('en')

        const { container } = renderRow({
            id: 'reasoning:1',
            type: 'assistant-reasoning',
            conversationId: 'reasoning:1',
            depth: 0,
            copyText: null,
            blocks: [],
            text: 'thinking through the problem',
            renderMode: 'plain',
        } as TranscriptRow)

        const button = await screen.findByRole('button', { name: 'Reasoning' })
        expect(button).toBeInTheDocument()
        expect(button.parentElement?.className).toContain('justify-center')
    })

    it('marks attachment-only user rows with images as media-only surfaces', () => {
        const { container } = renderRow({
            id: 'user:image',
            type: 'user',
            tone: 'user',
            conversationId: 'user:image',
            depth: 0,
            copyText: '',
            block: {
                kind: 'user-text',
                id: 'user-image',
                localId: null,
                createdAt: 1,
                text: '',
                renderMode: 'plain',
                status: undefined,
                attachments: [
                    {
                        id: 'att-1',
                        filename: 'cat.png',
                        mimeType: 'image/png',
                        size: 1200,
                        previewUrl: 'https://example.com/cat.png',
                    },
                ],
            },
        } as TranscriptRow)

        expect(container.querySelector('.ds-message-surface')).toHaveAttribute('data-content-layout', 'media-only')
    })
})
