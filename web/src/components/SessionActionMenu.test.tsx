import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { I18nProvider } from '@/lib/i18n-context'

vi.mock('@/components/ui/FloatingActionMenu', () => ({
    FloatingActionMenu: ({
        isOpen,
        content
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
    }
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            switch (key) {
                case 'session.action.rename':
                    return 'Rename'
                case 'session.action.resume':
                    return 'Continue'
                case 'session.action.archive':
                    return 'Archive'
                case 'session.action.unarchive':
                    return 'Restore'
                case 'session.action.delete':
                    return 'Delete'
                case 'session.more':
                    return 'More actions'
                default:
                    return key
            }
        }
    })
}))

function renderMenu(options: {
    lifecycleState: 'running' | 'closed' | 'archived'
    resumeAvailable: boolean
}) {
    render(
        <I18nProvider>
            <SessionActionMenu
                overlay={{
                    isOpen: true,
                    onClose: vi.fn(),
                    anchorPoint: { x: 0, y: 0 }
                }}
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

    it('shows only unarchive and delete for archived sessions', () => {
        renderMenu({
            lifecycleState: 'archived',
            resumeAvailable: true
        })

        expect(screen.getByText('Rename')).toBeInTheDocument()
        expect(screen.getByText('Restore')).toBeInTheDocument()
        expect(screen.getByText('Delete')).toBeInTheDocument()
        expect(screen.queryByText('Archive')).not.toBeInTheDocument()
        expect(screen.queryByText('Continue')).not.toBeInTheDocument()
    })
})
