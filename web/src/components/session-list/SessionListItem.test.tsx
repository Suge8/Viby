import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionListItem } from './SessionListItem'

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: (options: { onClick?: () => void; onLongPress?: (point: { x: number; y: number }) => void }) => ({
        onClick: options.onClick,
        onPointerCancel: vi.fn(),
        onPointerDown: vi.fn(),
        onPointerLeave: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onContextMenu: (event: { clientX?: number; clientY?: number }) => {
            options.onLongPress?.({
                x: event.clientX ?? 0,
                y: event.clientY ?? 0
            })
        },
    })
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn()
        }
    })
}))

function renderItem(selectionOverrides?: Partial<{
    onPreload: (sessionId: string) => void
    onSelect: (sessionId: string) => void
    onOpenActionMenu: (sessionId: string, point: { x: number; y: number }) => void
}>): void {
    render(
        <I18nProvider>
            <SessionListItem
                session={{
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    activeAt: Date.now(),
                    updatedAt: Date.now(),
                    latestActivityAt: Date.now(),
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: Date.now(),
                    lifecycleState: 'running',
                    lifecycleStateSince: Date.now(),
                    metadata: {
                        path: '/Users/sugeh/Project/Viby',
                        flavor: 'codex',
                        name: 'session-1'
                    },
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'xhigh'
                }}
                hasUnseenReply={false}
                selection={{
                    onSelect: selectionOverrides?.onSelect ?? vi.fn(),
                    onPreload: selectionOverrides?.onPreload,
                    selectedSessionId: null
                }}
                onOpenActionMenu={selectionOverrides?.onOpenActionMenu}
            />
        </I18nProvider>
    )
}

describe('SessionListItem', () => {
    afterEach(() => {
        cleanup()
    })

    it('preloads the session route when the card receives focus', () => {
        const onPreload = vi.fn()
        renderItem({ onPreload })

        fireEvent.focus(screen.getByRole('button'))

        expect(onPreload).toHaveBeenCalledWith('session-1')
    })

    it('preloads the session route on pointer-down intent before selection', () => {
        const onPreload = vi.fn()
        renderItem({ onPreload })

        const button = screen.getByRole('button')

        fireEvent.pointerDown(button, { pointerType: 'touch' })

        expect(onPreload).toHaveBeenCalledWith('session-1')
        expect(onPreload).toHaveBeenCalledTimes(1)
    })

    it('renders the session card through the shared card press primitive', () => {
        renderItem()

        const button = screen.getByRole('button')

        expect(button).toHaveAttribute('data-button-press-style', 'card')
        expect(button).toHaveAttribute('data-button-pointer-effect', 'none')
    })

    it('forwards long-press action intent to the shared list-level owner', () => {
        const onOpenActionMenu = vi.fn()
        renderItem({ onOpenActionMenu })

        fireEvent.contextMenu(screen.getByRole('button'), { clientX: 20, clientY: 24 })

        expect(onOpenActionMenu).toHaveBeenCalledWith('session-1', { x: 20, y: 24 })
    })

    it('only keeps the compact project metadata row under the title', () => {
        renderItem()

        expect(screen.getByText('Project/Viby')).toBeInTheDocument()
        expect(screen.queryByText('GPT-5.4')).not.toBeInTheDocument()
        expect(screen.queryByText('XHigh')).not.toBeInTheDocument()
    })
})
