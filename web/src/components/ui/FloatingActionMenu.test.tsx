import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingActionMenu } from '@/components/ui/FloatingActionMenu'
import type { FloatingActionMenuContent } from '@/components/ui/FloatingActionMenu.contract'

function createMenuContent(onSelect: () => void): FloatingActionMenuContent {
    return {
        heading: 'Actions',
        items: [
            {
                id: 'rename',
                label: 'Rename',
                icon: <span aria-hidden="true">R</span>,
                onSelect
            }
        ]
    }
}

describe('FloatingActionMenu', () => {
    beforeEach(() => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            callback(0)
            return 1
        })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('runs the selected item intent without implicitly closing the menu', () => {
        const onClose = vi.fn()
        const onRename = vi.fn()

        render(
            <FloatingActionMenu
                isOpen
                onClose={onClose}
                anchorPoint={{ x: 24, y: 36 }}
                content={createMenuContent(onRename)}
            />
        )

        fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

        expect(onRename).toHaveBeenCalledOnce()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('renders through a document portal so split-pane containment cannot clip it', () => {
        render(
            <div data-testid="host-shell">
                <FloatingActionMenu
                    isOpen
                    onClose={vi.fn()}
                    anchorPoint={{ x: 24, y: 36 }}
                    content={createMenuContent(vi.fn())}
                />
            </div>
        )

        const menu = screen.getByRole('menu')
        const menuSurface = menu.closest('.ds-dialog-surface')

        expect(menuSurface).not.toBeNull()
        expect(menuSurface?.parentElement).toBe(document.body)
        expect(screen.getByTestId('host-shell')).not.toContainElement(menu)
    })

    it('closes when pointer interaction happens outside the menu', () => {
        const onClose = vi.fn()

        render(
            <FloatingActionMenu
                isOpen
                onClose={onClose}
                anchorPoint={{ x: 24, y: 36 }}
                content={createMenuContent(vi.fn())}
            />
        )

        fireEvent.pointerDown(document.body)

        expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes on Escape', () => {
        const onClose = vi.fn()

        render(
            <FloatingActionMenu
                isOpen
                onClose={onClose}
                anchorPoint={{ x: 24, y: 36 }}
                content={createMenuContent(vi.fn())}
            />
        )

        fireEvent.keyDown(document, { key: 'Escape' })

        expect(onClose).toHaveBeenCalledOnce()
    })
})
