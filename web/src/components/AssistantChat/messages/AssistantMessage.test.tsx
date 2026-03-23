import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoticeProvider } from '@/lib/notice-center'
import { I18nProvider } from '@/lib/i18n-context'
import { VibyAssistantMessage } from './AssistantMessage'

type MockAssistantMessage = {
    id: string
    role: 'assistant'
    metadata: { custom?: unknown }
    content: Array<
        | { type: 'text'; text: string }
        | { type: 'reasoning'; text: string }
        | { type: 'tool-call'; toolName?: string }
    >
}

const mockState = vi.hoisted((): { message: MockAssistantMessage } => ({
    message: {
        id: 'assistant-1',
        role: 'assistant',
        metadata: {},
        content: [
            { type: 'reasoning', text: '思考中' },
            { type: 'text', text: '最终回复' }
        ]
    }
}))

beforeEach(() => {
    mockState.message = {
        id: 'assistant-1',
        role: 'assistant',
        metadata: {},
        content: [
            { type: 'reasoning', text: '思考中' },
            { type: 'text', text: '最终回复' }
        ]
    } satisfies MockAssistantMessage
})

afterEach(() => {
    cleanup()
})

vi.mock('@assistant-ui/react', () => ({
    MessagePrimitive: {
        Root: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
        Content: () => <div>assistant content</div>
    },
    useAssistantState: (selector: (state: { message: MockAssistantMessage }) => unknown) => {
        return selector({ message: mockState.message })
    }
}))

vi.mock('@/components/AssistantChat/messages/RichAssistantTextMessageContent', () => ({
    default: () => <div data-testid="rich-assistant-text-content">assistant content</div>
}))

vi.mock('@/components/AssistantChat/messages/RichAssistantToolMessageContent', () => ({
    default: () => <div data-testid="rich-assistant-tool-content">assistant tool content</div>
}))

vi.mock('@/components/CliOutputBlock', () => ({
    CliOutputBlock: () => null
}))

vi.mock('@/lib/clipboard', () => ({
    safeCopyToClipboard: vi.fn(async () => undefined)
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: vi.fn()
        }
    })
}))

function renderAssistantMessage(): void {
    render(
        <I18nProvider>
            <NoticeProvider>
                <VibyAssistantMessage />
            </NoticeProvider>
        </I18nProvider>
    )
}

describe('VibyAssistantMessage', () => {
    it('keeps assistant messages copyable when they include reasoning and final text', async () => {
        renderAssistantMessage()

        expect(document.querySelector('[data-copyable="true"]')).not.toBeNull()
        expect(await screen.findByTestId('rich-assistant-text-content')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull()
    })

    it('keeps plain assistant text on the lightweight path without loading rich rendering', () => {
        mockState.message = {
            id: 'assistant-plain',
            role: 'assistant',
            metadata: {},
            content: [{ type: 'text', text: 'plain assistant reply' }]
        }

        renderAssistantMessage()

        expect(screen.getByText('plain assistant reply')).toBeInTheDocument()
        expect(screen.queryByTestId('rich-assistant-text-content')).toBeNull()
        expect(screen.queryByTestId('rich-assistant-tool-content')).toBeNull()
    })

    it('routes tool-call assistant messages to the tool rich path', async () => {
        mockState.message = {
            id: 'assistant-tool',
            role: 'assistant',
            metadata: {},
            content: [{ type: 'tool-call' }]
        } satisfies MockAssistantMessage

        renderAssistantMessage()

        expect(await screen.findByTestId('rich-assistant-tool-content')).toBeInTheDocument()
        expect(screen.queryByTestId('rich-assistant-text-content')).toBeNull()
    })
})
