import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { I18nProvider } from '@/lib/i18n-context'

vi.mock('@/components/ui/FloatingActionMenu', () => ({
    FloatingActionMenu: ({
        isOpen,
        items
    }: {
        isOpen: boolean
        items: Array<{ id: string; label: string }>
    }) => {
        if (!isOpen) {
            return null
        }

        return (
            <div>
                {items.map((item) => (
                    <button key={item.id} type="button">
                        {item.label}
                    </button>
                ))}
            </div>
        )
    }
}))

function renderMenu(options: {
    lifecycleState: 'running' | 'closed' | 'archived'
    resumeAvailable: boolean
}) {
    render(
        <I18nProvider>
            <SessionActionMenu
                isOpen
                onClose={vi.fn()}
                anchorPoint={{ x: 0, y: 0 }}
                session={options}
                actions={{
                    onRename: vi.fn(),
                    onResume: vi.fn(),
                    onCloseSession: vi.fn(),
                    onArchive: vi.fn(),
                    onUnarchive: vi.fn(),
                    onDelete: vi.fn()
                }}
            />
        </I18nProvider>
    )
}

describe('SessionActionMenu', () => {
    afterEach(() => {
        cleanup()
    })

    it('hides resume for closed sessions without a durable resume marker', () => {
        renderMenu({
            lifecycleState: 'closed',
            resumeAvailable: false
        })

        expect(screen.queryByText('Continue')).not.toBeInTheDocument()
        expect(screen.getByText('Archive')).toBeInTheDocument()
        expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('shows resume only when the closed session is actually resumable', () => {
        renderMenu({
            lifecycleState: 'closed',
            resumeAvailable: true
        })

        expect(screen.getByText('Continue')).toBeInTheDocument()
    })
})
