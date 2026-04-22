import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { I18nProvider } from '@/lib/i18n-context'
import type { SessionLifecycleState } from '@/types/api'

vi.mock('@/components/ui/FloatingActionMenu', () => ({
    FloatingActionMenu: ({
        isOpen,
        content,
    }: {
        isOpen: boolean
        content: {
            items: Array<{ id: string; label: string }>
        }
    }) => {
        if (!isOpen) {
            return null
        }

        return (
            <div>
                {content.items.map((item) => (
                    <button key={item.id} type="button">
                        {item.label}
                    </button>
                ))}
            </div>
        )
    },
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            switch (key) {
                case 'session.action.rename':
                    return 'Rename'
                case 'session.action.stop':
                    return 'Stop'
                case 'session.action.delete':
                    return 'Delete'
                case 'session.more':
                    return 'More actions'
                default:
                    return key
            }
        },
    }),
}))

function renderMenu(options: { lifecycleState: SessionLifecycleState }) {
    render(
        <I18nProvider>
            <SessionActionMenu
                overlay={{
                    isOpen: true,
                    onClose: vi.fn(),
                    anchorPoint: { x: 0, y: 0 },
                }}
                session={options}
                onActionSelect={vi.fn()}
            />
        </I18nProvider>
    )
}

describe('SessionActionMenu', () => {
    afterEach(() => {
        cleanup()
    })

    it('keeps history actions minimal when a closed session has no durable resume marker', () => {
        renderMenu({
            lifecycleState: 'closed',
        })

        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('keeps resumable history sessions on the same minimal menu', () => {
        renderMenu({
            lifecycleState: 'closed',
        })

        expect(screen.queryByText('Start')).not.toBeInTheDocument()
        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.getByText('Delete')).toBeInTheDocument()
        expect(screen.queryByText('Stop')).not.toBeInTheDocument()
    })

    it('uses the same history menu for archived sessions', () => {
        renderMenu({
            lifecycleState: 'archived',
        })

        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.queryByText('Start')).not.toBeInTheDocument()
        expect(screen.getByText('Delete')).toBeInTheDocument()
        expect(screen.queryByText('Stop')).not.toBeInTheDocument()
    })

    it('shows stop for running sessions', () => {
        renderMenu({
            lifecycleState: 'running',
        })

        expect(screen.getByText('Stop')).toBeInTheDocument()
        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.queryByText('Delete')).not.toBeInTheDocument()
        expect(screen.queryByText('Start')).not.toBeInTheDocument()
    })

    it('keeps explicitly open sessions on the stop path instead of routing them through history start', () => {
        renderMenu({
            lifecycleState: 'open',
        })

        expect(screen.getByText('Stop')).toBeInTheDocument()
        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.queryByText('Start')).not.toBeInTheDocument()
    })
})
