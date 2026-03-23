import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { NoticeProvider } from '@/lib/notice-center'
import { I18nProvider } from '@/lib/i18n-context'
import { MessageSurface } from './MessageSurface'

const copyMock = vi.fn<(text: string) => Promise<void>>()
const hapticNotificationMock = vi.fn()

vi.mock('@/lib/clipboard', () => ({
    safeCopyToClipboard: (text: string) => copyMock(text)
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: hapticNotificationMock
        }
    })
}))

vi.mock('@/components/ui/animated-list', () => ({
    AnimatedList: (props: { children: ReactNode }) => <div>{props.children}</div>
}))

vi.mock('@/components/ui/blur-fade', () => ({
    BlurFade: (props: { children: ReactNode }) => <div>{props.children}</div>
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn()
}))

function renderMessageSurface(children: ReactNode) {
    return render(
        <I18nProvider>
            <NoticeProvider>
                {children}
                <FloatingNoticeViewport />
            </NoticeProvider>
        </I18nProvider>
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

    it('copies message content and shows the existing floating notice feedback', async () => {
        const view = renderMessageSurface(
            <MessageSurface tone="assistant" copyText="hello world">
                <div>hello world</div>
            </MessageSurface>
        )

        fireEvent.click(view.container.firstElementChild as HTMLElement)

        await waitFor(() => {
            expect(copyMock).toHaveBeenCalledWith('hello world')
        })

        expect(screen.getByText('Bubble copied')).toBeInTheDocument()
        expect(hapticNotificationMock).toHaveBeenCalledWith('success')
        expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull()
    })

    it('does not copy when the click originates from a nested interactive element', () => {
        renderMessageSurface(
            <MessageSurface tone="assistant" copyText="hello world">
                <button type="button">Nested action</button>
            </MessageSurface>
        )

        fireEvent.click(screen.getByRole('button', { name: 'Nested action' }))

        expect(copyMock).not.toHaveBeenCalled()
    })

    it('still copies even if another selection exists elsewhere on the page', async () => {
        const selectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
            toString: () => 'selected text'
        } as Selection)

        const view = renderMessageSurface(
            <MessageSurface tone="assistant" copyText="hello world">
                <div>hello world</div>
            </MessageSurface>
        )

        fireEvent.click(view.container.firstElementChild as HTMLElement)

        await waitFor(() => {
            expect(copyMock).toHaveBeenCalledWith('hello world')
        })
        selectionSpy.mockRestore()
    })
})
