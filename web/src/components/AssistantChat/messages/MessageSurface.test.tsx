import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { NoticeProvider } from '@/lib/notice-center'
import { I18nTestWrapper, preloadI18nForTests } from '@/test/i18n'
import { MessageSurface } from './MessageSurface'

const copyMock = vi.fn<(text: string) => Promise<void>>()
const hapticNotificationMock = vi.fn()

vi.mock('@/lib/clipboard', () => ({
    safeCopyToClipboard: (text: string) => copyMock(text),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: hapticNotificationMock,
            selection: vi.fn(),
        },
    }),
}))

vi.mock('@/components/ui/animated-list', () => ({
    AnimatedList: (props: { children: ReactNode }) => <div>{props.children}</div>,
}))

vi.mock('@/components/ui/blur-fade', () => ({
    BlurFade: (props: { children: ReactNode }) => <div>{props.children}</div>,
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
}))

async function renderMessageSurface(ui: ReactNode) {
    await preloadI18nForTests()
    return render(
        <I18nTestWrapper>
            <NoticeProvider>
                {ui}
                <FloatingNoticeViewport />
            </NoticeProvider>
        </I18nTestWrapper>
    )
}

describe('MessageSurface', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        copyMock.mockReset()
        copyMock.mockResolvedValue(undefined)
        hapticNotificationMock.mockReset()
    })

    it('copies message content from the explicit copy button and shows the floating notice feedback', async () => {
        await renderMessageSurface(
            <MessageSurface tone="assistant" copyText="hello world">
                <div>hello world</div>
            </MessageSurface>
        )

        fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))

        await waitFor(() => {
            expect(copyMock).toHaveBeenCalledWith('hello world')
        })

        expect(screen.getByText('Bubble copied')).toBeInTheDocument()
        expect(hapticNotificationMock).toHaveBeenCalledWith('success')
        expect(screen.getByRole('button', { name: 'Copy message' })).toHaveClass('ds-message-copy-button')
    })

    it('does not copy when pressing the message surface body', async () => {
        const view = await renderMessageSurface(
            <MessageSurface tone="assistant" copyText="hello world">
                <div>hello world</div>
            </MessageSurface>
        )

        fireEvent.click(view.container.firstElementChild as HTMLElement)

        expect(copyMock).not.toHaveBeenCalled()
    })
})
